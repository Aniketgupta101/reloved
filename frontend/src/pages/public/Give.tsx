import React, { useState, useRef, useEffect, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { api, resolveImageUrl } from "@/lib/api"
import { GiveFlowProvider } from "@/pages/public/give/giveFlow"
import { GiveView } from "@/pages/public/give/GiveView"
import {
  BULK_PHOTO_LIMIT,
  draftFromSuggestion,
  emptyItemDraft,
  hydratePhotoFile,
  PICKUP_LOCALITY_MAX,
  SINGLE_PHOTO_LIMIT,
  type GiveForm,
  type ItemDraft,
  type ItemSuggestion,
  type PhotoItem,
} from "@/pages/public/give/model"
import { getDonorToken, getDonorPrefs } from "@/lib/donorSession"
import { compressImageFiles } from "@/lib/compressImage"
import { mapPool } from "@/lib/concurrency"
import {
  acceptDonationResult,
  assignChunkResults,
  canLeaveForLogin,
  idempotencyKeyForGroup,
  mergePhotosById,
  newPhotoId,
  persistentPreviewUrl,
  uploadNameForPhoto,
  withUniquePhotoName,
} from "@/lib/givePhotoDraft"
import { AnalyticsEvent, track } from "@/lib/analytics"
import { withIndiaPincode } from "@/lib/logisticsLinks"
import {
  getGiveSubmissionFeedback,
  type PartialGiveResult,
  type UserFacingFeedback,
} from "@/lib/userFacingErrors"
import {
  SIZE_REQUIRED_CATEGORIES,
  normalizeItemGender,
  normalizeLaunchCategory,
  toStorageCategory,
  toStorageGender,
  type GiverLogistics,
} from "@shared/taxonomy"

export function Give() {
  const [step, setStep] = useState(1)

  useEffect(() => {
    track(AnalyticsEvent.donationStepViewed, { step, flow: "give" })
  }, [step])
  const navigate = useNavigate()
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)

  const [photoItems, setPhotoItems] = useState<PhotoItem[]>([])
  const photoItemsRef = useRef<PhotoItem[]>([])
  useEffect(() => {
    photoItemsRef.current = photoItems
  }, [photoItems])
  const [uploadMode, setUploadMode] = useState<"single" | "bulk">("single")
  /** In Multiple Items mode, new photos join this item group until reassigned. */
  const [activeGroupId, setActiveGroupId] = useState(0)
  /** Which item's fields are shown on the Details step (multi-item). */
  const [detailGroupId, setDetailGroupId] = useState(0)
  const [multiIncompleteNote, setMultiIncompleteNote] = useState<string | null>(null)
  /** AI + user edits per item group — used for multi-item Details / Review / submit. */
  const [itemDrafts, setItemDrafts] = useState<Record<number, ItemDraft>>({})
  const [compressingPhotos, setCompressingPhotos] = useState(false)
  const [photoPickError, setPhotoPickError] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [aiApplied, setAiApplied] = useState(false)
  /** Bump to cancel an in-flight analyze when user abandons the drop (not on Skip titles). */
  const analyzeGenRef = useRef(0)
  /** Skip auto-fill: user owns titles; keep studio cutouts running in the background. */
  const skippedAutofillRef = useRef(false)
  /** True while analyzePhotos is still working (even after Skip clears the UI spinner). */
  const analyzeInFlightRef = useRef(false)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)
  const [sensitivePhotoWarning, setSensitivePhotoWarning] = useState<string | null>(null)
  const [bgKeptNote, setBgKeptNote] = useState<string | null>(null)
  /** Shown after mid-drop login when we restore / re-upload draft photos. */
  const [loginResumeNote, setLoginResumeNote] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submitLockRef = useRef(false)
  const [submitFeedback, setSubmitFeedback] = useState<UserFacingFeedback | null>(null)

  const [formData, setFormData] = useState<GiveForm>({
    itemTitle: "",
    category: "Tops",
    gender: "unisex",
    description: "",
    condition: "Good",
    size: "",
    quantity: 1,
    brand: "",
    age: "",
    defect: "",
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    contactMethod: "WhatsApp",
    recognitionPreference: "anonymous",
    aliasName: "",
    city: "Mumbai",
    pincode: "",
    pickupLocality: "",
    dateRange: "Flexible",
    timeWindow: "Flexible",
    notes: "",
    declaration: false,
    acceptedTerms: false,
    giverLogistics: "porter_arranged" as GiverLogistics,
    deliveryAddress: "",
    porterPaidBy: "receiver" as "" | "receiver" | "giver",
    latitude: null as number | null,
    longitude: null as number | null,
  })

  // If a donor is already logged in and onboarded, we already have their
  // name/phone/address/pincode on file - reuse it end-to-end instead of
  // asking again. hasSavedAddress gates showing a reuse summary (with an
  // Edit escape hatch) instead of the raw city/pincode/locality inputs.
  const [skipDonorDetails, setSkipDonorDetails] = useState(false)
  const [hasSavedAddress, setHasSavedAddress] = useState(false)
  const [editingAddress, setEditingAddress] = useState(false)
  const [profileUsername, setProfileUsername] = useState<string | null>(() => getDonorPrefs()?.username ?? null)
  const [loggedIn, setLoggedIn] = useState(() => Boolean(getDonorToken()))

  const GIVE_DRAFT_KEY = "reloved_give_draft"
  const GIVE_LOGIN_PATH = `/account/login?redirect=${encodeURIComponent("/give")}`
  const GIVE_ONBOARD_PATH = `/account/onboarding?redirect=${encodeURIComponent("/give")}`
  const draftRestoredRef = useRef(false)
  const skipHistoryPushRef = useRef(false)
  /** One key per item group. A retry of that group reuses it; another group does not. */
  const itemIdempotencyRef = useRef<Map<number, string>>(new Map())

  useEffect(() => {
    setLoggedIn(Boolean(getDonorToken()))
  }, [step])

  // Restore draft after login/onboarding / refresh — keep until successful submit.
  // Only force “reconnect photos” when draft.awaitingLogin (user left for login).
  // Already-logged-in refresh must NOT re-run AI on every multi-item photo.
  useEffect(() => {
    if (draftRestoredRef.current) return
    draftRestoredRef.current = true
    try {
      const raw = localStorage.getItem(GIVE_DRAFT_KEY) || sessionStorage.getItem(GIVE_DRAFT_KEY)
      if (!raw) return
      const draft = JSON.parse(raw) as {
        formData?: typeof formData
        photoItems?: Array<{
          previewUrl: string
          status: string
          storagePath?: string
          groupId: number
          photoId?: string
          fileName?: string
          bgRemoved?: boolean
        }>
        step?: number
        uploadMode?: "single" | "bulk"
        activeGroupId?: number
        itemDrafts?: typeof itemDrafts
        awaitingLogin?: boolean
      }
      const token = getDonorToken()
      const midLoginResume = Boolean(draft.awaitingLogin) && Boolean(token)
      let photosNeedReadd = false
      if (draft.formData) setFormData((prev) => ({ ...prev, ...draft.formData }))
      if (draft.uploadMode) setUploadMode(draft.uploadMode)
      if (typeof draft.activeGroupId === "number") setActiveGroupId(draft.activeGroupId)
      if (draft.itemDrafts) setItemDrafts(draft.itemDrafts)
      if (Array.isArray(draft.photoItems) && draft.photoItems.length) {
        const restored: PhotoItem[] = []
        let lostPhotos = 0
        for (const p of draft.photoItems) {
          const url = persistentPreviewUrl(p.storagePath, resolveImageUrl)
          if (!p.storagePath || !url) {
            lostPhotos += 1
            continue
          }
          restored.push({
            photoId: p.photoId || newPhotoId(),
            previewUrl: url,
            status: "done",
            storagePath: p.storagePath,
            groupId: p.groupId ?? 0,
            bgRemoved: p.bgRemoved,
          })
        }
        setPhotoItems(restored)
        const hasUsefulTitles = Object.values(draft.itemDrafts || {}).some((d) => {
          const t = (d?.itemTitle || "").trim()
          return t.length > 0 && !/^item\s*\d+$/i.test(t)
        })
        setAiApplied(restored.length > 0 && (restored.every((p) => Boolean(p.storagePath)) || (hasUsefulTitles && !midLoginResume)))
        if (lostPhotos > 0) {
          photosNeedReadd = true
          setLoginResumeNote(
            "Some photos were not saved before you left. Add those again on the Photo step. The rest of your drop is still here.",
          )
          setAiApplied(false)
        } else if (token && midLoginResume) {
          setLoginResumeNote("Welcome back — your drop draft was restored. Review and submit when ready.")
        } else if (restored.length > 0) {
          setLoginResumeNote("Draft restored — continue where you left off.")
        }
      } else if (token && typeof draft.step === "number" && draft.step >= 2) {
        setLoginResumeNote("Draft restored — continue where you left off.")
      }
      // Resume exact step; if guest draft was on Login (8) and user is now logged in → Review (6).
      if (photosNeedReadd) {
        setStep(1)
      } else if (typeof draft.step === "number" && draft.step >= 1) {
        let resume = draft.step
        if (token && (resume === 8 || resume === 4)) resume = 6
        if (!token && resume > 2 && resume !== 8) resume = 8
        setStep(resume)
      }
      // Clear awaitingLogin so a later refresh does not re-trigger reconnect.
      try {
        const cleaned = { ...draft, awaitingLogin: false, savedAt: Date.now() }
        const cleanedRaw = JSON.stringify(cleaned)
        localStorage.setItem(GIVE_DRAFT_KEY, cleanedRaw)
        sessionStorage.removeItem(GIVE_DRAFT_KEY)
      } catch {
        localStorage.setItem(GIVE_DRAFT_KEY, raw)
        sessionStorage.removeItem(GIVE_DRAFT_KEY)
      }
    } catch {
      /* ignore corrupt draft */
    }
  }, [])

  async function persistGiveDraft(
    nextStep?: number,
    photosOverride?: PhotoItem[],
    opts?: { awaitingLogin?: boolean },
  ): Promise<boolean> {
    const source = photosOverride ?? photoItemsRef.current
    const photos: Array<{
      previewUrl: string
      status: "done"
      storagePath: string
      groupId: number
      photoId: string
      fileName?: string
      bgRemoved?: boolean
    }> = []
    for (const p of source) {
      const url = persistentPreviewUrl(p.storagePath, resolveImageUrl)
      if (!p.storagePath || !url) continue
      photos.push({
        previewUrl: url,
        status: "done",
        storagePath: p.storagePath,
        groupId: p.groupId,
        photoId: p.photoId,
        fileName: p.file?.name,
        bgRemoved: p.bgRemoved,
      })
    }
    if (opts?.awaitingLogin && source.length > 0 && photos.length !== source.length) {
      setLoginResumeNote(
        "We couldn’t save your photo before sign-in. Stay on this page and try again. Your other details are still here.",
      )
      return false
    }
    try {
      const payload = JSON.stringify({
        formData,
        uploadMode,
        activeGroupId,
        itemDrafts,
        step: typeof nextStep === "number" ? nextStep : step,
        photoItems: photos,
        awaitingLogin: opts?.awaitingLogin === true,
        savedAt: Date.now(),
      })
      localStorage.setItem(GIVE_DRAFT_KEY, payload)
      sessionStorage.setItem(GIVE_DRAFT_KEY, payload)
      return true
    } catch (err) {
      console.error("give draft save failed", err)
      setLoginResumeNote(
        "This device couldn’t store your drop draft. Stay on this page and try again.",
      )
      return false
    }
  }

  function clearGiveDraft() {
    localStorage.removeItem(GIVE_DRAFT_KEY)
    sessionStorage.removeItem(GIVE_DRAFT_KEY)
  }

  // Existing users: username / area auto-fill when already logged in.
  useEffect(() => {
    if (!getDonorToken()) return
    api.donor
      .get<{
        profile: {
          name: string | null
          username?: string | null
          phone: string | null
          email?: string | null
          address: string | null
          pincode: string | null
          onboardedAt: string | null
          latitude?: number | null
          longitude?: number | null
        } | null
      }>("/api/donor/profile")
      .then(({ profile }) => {
        if (!profile?.onboardedAt) return
        const [firstName, ...rest] = (profile.name || "").split(" ")
        const profilePhone = profile.phone || ""
        const username = (profile.username || getDonorPrefs()?.username || "").replace(/^@/, "").trim()
        if (username) setProfileUsername(username)
        setFormData((prev) => ({
          ...prev,
          firstName: prev.firstName || firstName || "",
          lastName: prev.lastName || rest.join(" ") || "",
          phone: prev.phone || profilePhone,
          email: prev.email || profile.email || "",
          pickupLocality: prev.pickupLocality || profile.address || "",
          pincode: prev.pincode || profile.pincode || "",
          latitude: prev.latitude ?? profile.latitude ?? null,
          longitude: prev.longitude ?? profile.longitude ?? null,
          recognitionPreference:
            username && prev.recognitionPreference === "anonymous" ? "alias" : prev.recognitionPreference,
          aliasName: username || prev.aliasName,
        }))
        setSkipDonorDetails(true)
        if (profile.address) setHasSavedAddress(true)
      })
      .catch(() => {})
  }, [])

  // Guest: photo → details → login → review → post (no handover — schedule after claim).
  const steps = !loggedIn
    ? [1, 2, 8, 6, 7]
    : skipDonorDetails
      ? [1, 2, 6, 7]
      : [1, 2, 3, 6, 7]

  const STEP_LABELS: Record<number, string> = {
    1: "Photo",
    2: "Details",
    3: "You",
    6: "Review",
    7: "Post",
    8: "Login",
  }

  const flowStepsRef = useRef(steps)
  flowStepsRef.current = steps

  // If skip flips on while user is on step 3 or 5, remount onto a valid step.
  useEffect(() => {
    if (skipDonorDetails && (step === 3 || step === 5 || step === 4)) setStep(6)
    if (loggedIn && (step === 8 || step === 4)) setStep(6)
  }, [skipDonorDetails, step, loggedIn])

  // Keep draft warm while the user works (survives refresh / login).
  useEffect(() => {
    if (!draftRestoredRef.current) return
    if (photoItems.length === 0 && step === 1) return
    const t = window.setTimeout(() => {
      void persistGiveDraft(step)
    }, 400)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- persist snapshot of current form/photos
  }, [step, formData, photoItems, uploadMode, activeGroupId, itemDrafts])

  // Mobile hardware Back = previous drop step (not Wall / home).
  const historyReadyRef = useRef(false)
  useEffect(() => {
    window.history.replaceState({ giveFlow: true, step }, "")
    historyReadyRef.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed history once on mount
  }, [])

  useEffect(() => {
    if (!historyReadyRef.current) return
    if (skipHistoryPushRef.current) {
      skipHistoryPushRef.current = false
      window.history.replaceState({ giveFlow: true, step }, "")
      return
    }
    window.history.pushState({ giveFlow: true, step }, "")
  }, [step])

  useEffect(() => {
    const onPop = () => {
      const currentSteps = flowStepsRef.current
      const idx = currentSteps.indexOf(step)
      if (idx > 0) {
        skipHistoryPushRef.current = true
        const prev = currentSteps[idx - 1]
        setStep(prev)
        void persistGiveDraft(prev)
        return
      }
      // First step: allow leaving the flow (browser navigates away).
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  const handleBack = () => {
    const currentSteps = flowStepsRef.current
    const idx = currentSteps.indexOf(step)
    if (idx > 0) {
      window.history.back()
      return
    }
    if (step === 3 || step === 5 || step === 8) {
      skipHistoryPushRef.current = true
      setStep(2)
      void persistGiveDraft(2)
      window.history.replaceState({ giveFlow: true, step: 2 }, "")
    }
  }

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target
    const list = input.files
    if (!list || list.length === 0) {
      input.value = ""
      return
    }

    const raw = Array.from(list).filter((f) => f && f.size > 0)
    input.value = ""
    setPhotoPickError(null)

    if (raw.length === 0) {
      setPhotoPickError("That photo didn’t save. Try again, or pick one from your gallery.")
      return
    }

    setCompressingPhotos(true)
    try {
      const limit = uploadMode === "bulk" ? BULK_PHOTO_LIMIT : SINGLE_PHOTO_LIMIT
      const room = Math.max(0, limit - photoItems.length)
      if (room === 0) {
        setPhotoPickError(
          uploadMode === "bulk"
            ? `Limit reached: ${BULK_PHOTO_LIMIT}/${BULK_PHOTO_LIMIT} items. Remove one to add another.`
            : `Limit reached: ${SINGLE_PHOTO_LIMIT}/${SINGLE_PHOTO_LIMIT} photo for this item. Remove it to add another.`,
        )
        return
      }
      const files = (await compressImageFiles(raw.slice(0, Math.max(room, 1)))).filter(
        (f) => f && f.size > 0,
      )
      if (files.length === 0) {
        setPhotoPickError("Couldn’t read that photo. Try gallery, or take another shot.")
        return
      }
      if (raw.length > room) {
        setPhotoPickError(
          uploadMode === "bulk"
            ? `Only ${room} more slot${room === 1 ? "" : "s"} left (max ${BULK_PHOTO_LIMIT} items). Added ${Math.min(files.length, room)}.`
            : `Only ${room} more photo left (max ${SINGLE_PHOTO_LIMIT}). Added what fits.`,
        )
      }
      setPhotoItems((prev) => {
        if (uploadMode === "single") {
          return [
            ...prev,
            ...files.map((file) => {
              const photoId = newPhotoId()
              const named = withUniquePhotoName(file, photoId)
              return {
                photoId,
                file: named,
                previewUrl: URL.createObjectURL(named),
                status: "pending" as const,
                groupId: 0,
              }
            }),
          ]
        }

        // Multiple Items: each new photo starts as its own item (Spider-Man
        // costume #1, #2, …). User can regroup angles by selecting an Item
        // chip and tapping photos. Camera one-at-a-time used to dump every
        // shot onto the same group → only 1 Wall listing.
        const start =
          prev.length === 0 ? 0 : Math.max(0, ...prev.map((p) => p.groupId), activeGroupId) + 1
        return [
          ...prev,
          ...files.map((file, i) => {
            const photoId = newPhotoId()
            const named = withUniquePhotoName(file, photoId)
            return {
              photoId,
              file: named,
              previewUrl: URL.createObjectURL(named),
              status: "pending" as const,
              groupId: start + i,
            }
          }),
        ]
      })
      if (uploadMode === "bulk") {
        const start =
          photoItems.length === 0 ? 0 : Math.max(0, ...photoItems.map((p) => p.groupId), activeGroupId) + 1
        setDetailGroupId(start)
        setActiveGroupId(start + files.length - 1)
      }
      setAiApplied(false)
      // Do not wipe itemDrafts — adding photos must not erase titles already edited.
    } catch (err) {
      console.error("Photo pick failed", err)
      setPhotoPickError("Couldn’t add that photo. Please try again.")
    } finally {
      setCompressingPhotos(false)
    }
  }

  const openCamera = () => {
    setPhotoPickError(null)
    cameraInputRef.current?.click()
  }

  const openGallery = () => {
    setPhotoPickError(null)
    galleryInputRef.current?.click()
  }

  const removePhoto = (index: number) => {
    setPhotoItems((prev) => prev.filter((_, i) => i !== index))
    setAiApplied(false)
  }

  /** Create / select the next item bucket (Multiple Items). */
  const startNewItemGroup = () => {
    const nextId = photoItems.length === 0 ? 0 : Math.max(0, ...photoItems.map((p) => p.groupId), activeGroupId) + 1
    setActiveGroupId(nextId)
  }

  /** Tap a photo to move it into the selected item. */
  const assignPhotoToActiveItem = (index: number) => {
    if (uploadMode !== "bulk") return
    setPhotoItems((prev) => prev.map((p, i) => (i === index ? { ...p, groupId: activeGroupId } : p)))
    setAiApplied(false)
  }

  /** Up to 5 photos for one item; up to 30 when posting multiple items. */
  const photoLimit = uploadMode === "bulk" ? BULK_PHOTO_LIMIT : SINGLE_PHOTO_LIMIT
  const uniqueGroups = Array.from(new Set(photoItems.map((p) => p.groupId))).sort((a, b) => a - b)
  const uniqueGroupCount = uniqueGroups.length
  const isMultiItem = uploadMode === "bulk" && uniqueGroupCount > 1
  /** Item chips: every used group + the selected (maybe empty) group. */
  const itemSlots = Array.from(new Set([...uniqueGroups, activeGroupId])).sort((a, b) => a - b)
  const itemLabel = (groupId: number) => itemSlots.indexOf(groupId) + 1
  const countInGroup = (groupId: number) => photoItems.filter((p) => p.groupId === groupId).length
  const activeItemLabel = itemLabel(activeGroupId)
  const detailGroup = uniqueGroups.includes(detailGroupId) ? detailGroupId : uniqueGroups[0] ?? 0
  const activeDraft: ItemDraft =
    itemDrafts[detailGroup] ||
    draftFromSuggestion(photoItems.find((p) => p.groupId === detailGroup)?.suggestion) ||
    emptyItemDraft()

  function patchActiveDraft(patch: Partial<ItemDraft>) {
    const gid = detailGroup
    setItemDrafts((prev) => ({
      ...prev,
      [gid]: { ...(prev[gid] || activeDraft), ...patch },
    }))
    if (gid === uniqueGroups[0]) {
      setFormData((fd) => ({ ...fd, ...patch }))
    }
  }

  /** Persist whatever is on screen into itemDrafts before switching tabs / Continue. */
  function commitActiveDraft() {
    if (!isMultiItem) return
    const gid = detailGroup
    setItemDrafts((prev) => ({
      ...prev,
      [gid]: { ...(prev[gid] || activeDraft) },
    }))
  }

  function selectDetailGroup(gid: number) {
    commitActiveDraft()
    setDetailGroupId(gid)
    setMultiIncompleteNote(null)
  }

  // Runs every photo through the same background-removal + Gemini
  // categorization pipeline as admin bulk-upload - swaps previews to the
  // white-bg processed version and pre-fills item details from the AI's
  // best guess. A photo that fails analysis just stays as the raw upload;
  // it never blocks the donor from continuing.
  // `force` + `photos` used after mid-drop login to re-upload draft previews.
  // `onlyUnprocessed` = studio cutout for photos still missing bgRemoved
  // `onlyWithoutStorage` = save originals to storage (catalog) when submit/cutout left no path
  // (Skip title autofill must never cancel this path).
  const analyzePhotos = async (opts?: {
    force?: boolean
    photos?: PhotoItem[]
    onlyMissing?: boolean
    onlyUnprocessed?: boolean
    onlyWithoutStorage?: boolean
    mode?: "catalog" | "cutout" | "full" | "store"
  }): Promise<PhotoItem[] | null> => {
    const mode =
      opts?.mode ||
      (opts?.onlyWithoutStorage ? "store" : opts?.onlyUnprocessed ? "cutout" : "full")
    const allSource = opts?.photos ?? photoItemsRef.current
    let source = opts?.onlyWithoutStorage
      ? allSource.filter((p) => !p.storagePath && p.file && p.file.size > 0)
      : opts?.onlyUnprocessed
        ? allSource.filter((p) => !p.bgRemoved && p.file && p.file.size > 0)
        : opts?.onlyMissing
          ? allSource.filter((p) => {
              const title = (itemDrafts[p.groupId]?.itemTitle || p.suggestion?.title || "").trim()
              return !title || /^item\s*\d+$/i.test(title)
            })
          : allSource
    if (source.length === 0) return allSource

    if (analyzeInFlightRef.current) {
      if (
        !opts?.force &&
        !opts?.onlyUnprocessed &&
        !opts?.onlyWithoutStorage &&
        !opts?.onlyMissing &&
        mode !== "cutout"
      ) {
        return null
      }
      const deadline = Date.now() + 240_000
      while (analyzeInFlightRef.current && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 400))
      }
      if (analyzeInFlightRef.current) return photoItemsRef.current
      if (opts?.onlyWithoutStorage) {
        source = photoItemsRef.current.filter((p) => !p.storagePath && p.file && p.file.size > 0)
        if (source.length === 0) return photoItemsRef.current
      } else if (opts?.onlyUnprocessed || mode === "cutout") {
        source = photoItemsRef.current.filter((p) => !p.bgRemoved && p.file && p.file.size > 0)
        if (source.length === 0) return photoItemsRef.current
      }
    }

    if (
      !opts?.force &&
      !opts?.onlyMissing &&
      !opts?.onlyUnprocessed &&
      !opts?.onlyWithoutStorage &&
      mode !== "cutout" &&
      aiApplied
    ) {
      return allSource
    }

    if (
      !opts?.onlyMissing &&
      !opts?.onlyUnprocessed &&
      !opts?.onlyWithoutStorage &&
      mode !== "cutout"
    ) {
      skippedAutofillRef.current = false
    }
    // Cutout / polish / storage-save passes must preserve titles the user already typed.
    if (opts?.onlyUnprocessed || opts?.onlyWithoutStorage || mode === "cutout") {
      skippedAutofillRef.current = true
    }

    const gen = ++analyzeGenRef.current
    analyzeInFlightRef.current = true
    // Catalog on Photo step shows spinner; cutout runs quietly in background.
    if (mode === "catalog" || (mode === "full" && step === 1)) setAnalyzing(true)
    setAnalyzeError(null)
    setSensitivePhotoWarning(null)
    if (!opts?.onlyUnprocessed) setBgKeptNote(null)
    setMultiIncompleteNote(null)
    try {
      // Prefer real File blobs; rebuild from data/blob previews if login wiped them.
      const ready = await Promise.all(source.map(hydratePhotoFile))
      if (gen !== analyzeGenRef.current) return photoItemsRef.current
      if (!opts?.onlyMissing && !opts?.onlyUnprocessed && !opts?.onlyWithoutStorage) {
        setPhotoItems(ready)
        photoItemsRef.current = ready
      }

      if (!ready.some((p) => p.file && p.file.size > 0)) {
        if (gen !== analyzeGenRef.current) return photoItemsRef.current
        setAnalyzeError("Photos could not be read. Please add them again on the Photo step.")
        setLoginResumeNote(
          "We need you to re-add photos once — then you can finish your drop.",
        )
        setStep(1)
        return photoItemsRef.current
      }

      type AnalyzeOk = {
        ok: true
        originalName?: string
        filename?: string
        storagePath?: string
        url?: string
        originalStoragePath?: string
        modelledStoragePath?: string
        suggestion?: ItemSuggestion
        bgRemoved?: boolean
        sensitiveDetected?: boolean
        sensitiveReason?: string | null
      }
      type AnalyzeFail = { ok: false; originalName?: string; filename?: string; error?: string }
      // Smaller chunks = fewer mid-batch timeouts on multi-drops.
      const CHUNK = 3
      const results: (AnalyzeOk | AnalyzeFail)[] = new Array(ready.length)
      for (let start = 0; start < ready.length; start += CHUNK) {
        if (gen !== analyzeGenRef.current) return photoItemsRef.current
        const chunk = ready.slice(start, start + CHUNK)
        const form = new FormData()
        form.append("mode", mode)
        chunk.forEach((p) => {
          if (!p.file || p.file.size < 1) return
          const ext = p.file.name.includes(".") ? p.file.name.split(".").pop() : "jpg"
          form.append("photos", p.file, uploadNameForPhoto(p.photoId, ext || "jpg"))
        })
        if (![...form.keys()].filter((k) => k === "photos").length) continue
        try {
          const { results: chunkResults } = await api.postForm<{
            results: (AnalyzeOk | AnalyzeFail)[]
            firstSuggestion?: ItemSuggestion | null
          }>(`/api/donations/analyze-photos?mode=${encodeURIComponent(mode)}`, form)
          assignChunkResults(chunk, chunkResults).forEach((result, j) => {
            results[start + j] = result
          })
        } catch (chunkErr) {
          console.error("analyze-photos chunk failed:", chunkErr)
          chunk.forEach((_p, j) => {
            results[start + j] = { ok: false, error: "chunk failed" }
          })
        }
      }
      const apiFirst = results.find((r): r is AnalyzeOk => Boolean(r?.ok && "suggestion" in r && r.suggestion))?.suggestion
      if (gen !== analyzeGenRef.current) return photoItemsRef.current

      let anySensitive = false
      let anyBgKept = false
      const nextPhotos = ready.map((p, i) => {
        const r = results[i]
        if (!r || !r.ok || !("suggestion" in r) || !r.suggestion) {
          return { ...p, status: p.storagePath ? ("done" as const) : ("pending" as const) }
        }
        const suggestion = {
          ...r.suggestion,
          category: normalizeLaunchCategory(r.suggestion.category),
          gender: normalizeItemGender(r.suggestion.gender),
        }
        const sensitive =
          Boolean(r.sensitiveDetected) || Boolean(r.suggestion.sensitiveDetected)
        if (sensitive) anySensitive = true
        const storagePath = r.storagePath || r.url
        if (storagePath) {
          if (r.bgRemoved === false) anyBgKept = true
          const originalPath =
            r.originalStoragePath ||
            (r.bgRemoved ? p.originalStoragePath || p.storagePath : storagePath)
          const modelledPath = r.modelledStoragePath || (r.bgRemoved ? storagePath : p.modelledStoragePath)
          return {
            ...p,
            status: "done" as const,
            storagePath,
            originalStoragePath: originalPath || undefined,
            modelledStoragePath: modelledPath || undefined,
            previewUrl: resolveImageUrl(storagePath) || p.previewUrl,
            suggestion,
            bgRemoved: Boolean(r.bgRemoved),
            sensitiveDetected: sensitive,
            sensitiveReason: r.sensitiveReason || r.suggestion.sensitiveReason || null,
          }
        }
        return {
          ...p,
          status: "pending" as const,
          suggestion,
          bgRemoved: false,
          sensitiveDetected: sensitive,
          sensitiveReason: r.sensitiveReason || r.suggestion.sensitiveReason || null,
        }
      })
      if (gen !== analyzeGenRef.current) return photoItemsRef.current
      // Always merge cutouts into current photos; never wipe user-typed titles after Skip.
      const preserveUser =
        skippedAutofillRef.current ||
        Boolean(opts?.onlyMissing) ||
        Boolean(opts?.onlyUnprocessed) ||
        Boolean(opts?.onlyWithoutStorage)
      setPhotoItems((prev) => {
        const merged =
          preserveUser || opts?.onlyMissing || opts?.onlyUnprocessed || opts?.onlyWithoutStorage
            ? mergePhotosById(prev, nextPhotos)
            : nextPhotos
        photoItemsRef.current = merged
        return merged
      })
      setItemDrafts((prev) => {
        const next = { ...prev }
        for (const p of nextPhotos) {
          if (!p.suggestion) {
            if (!preserveUser && !next[p.groupId]) next[p.groupId] = emptyItemDraft()
            continue
          }
          const fromAi = draftFromSuggestion(p.suggestion)
          const existing = next[p.groupId]
          if (!preserveUser && !existing) {
            if (!next[p.groupId]) next[p.groupId] = fromAi
            continue
          }
          if (
            !existing ||
            !(existing.itemTitle || "").trim() ||
            /^item\s*\d+$/i.test(existing.itemTitle.trim())
          ) {
            next[p.groupId] = {
              ...fromAi,
              ...(existing || {}),
              itemTitle: fromAi.itemTitle || existing?.itemTitle || "",
              size: existing?.size || fromAi.size,
              age: existing?.age || fromAi.age,
              brand: existing?.brand || fromAi.brand,
              description: existing?.description || fromAi.description,
              category: existing?.category && existing.category !== "Tops" ? existing.category : fromAi.category,
              gender: existing?.gender || fromAi.gender,
              condition: existing?.condition || fromAi.condition,
              quantity: existing?.quantity || fromAi.quantity,
            }
          } else {
            next[p.groupId] = {
              ...existing,
              size: existing.size || fromAi.size,
              age: existing.age || fromAi.age,
            }
          }
        }
        if (!preserveUser) {
          for (const p of nextPhotos) {
            if (!next[p.groupId]) next[p.groupId] = draftFromSuggestion(p.suggestion)
          }
        }
        return next
      })
      if (
        !opts?.onlyMissing &&
        !opts?.onlyUnprocessed &&
        !opts?.onlyWithoutStorage &&
        !skippedAutofillRef.current
      ) {
        const groupIdsSeed = Array.from(new Set(nextPhotos.map((p) => p.groupId))).sort((a, b) => a - b)
        if (groupIdsSeed.length) setDetailGroupId(groupIdsSeed[0])
      }

      const groupIds = Array.from(new Set((opts?.onlyMissing ? photoItems : nextPhotos).map((p) => p.groupId))).sort(
        (a, b) => a - b,
      )
      void groupIds

      if (anySensitive) {
        setSensitivePhotoWarning(
          "This photo may show personal details (face, ID, or address). Retake of the item only is safer — you can still continue."
        )
      }
      if (anyBgKept) {
        setBgKeptNote("Background kept as-is (studio cutout unavailable). You can still continue.")
      }

      const failedCutout = results.some(
        (r) => r && !r.ok && String((r as AnalyzeFail).error || "").toLowerCase().includes("cutout"),
      )
      if (failedCutout && !nextPhotos.some((p) => p.status === "done")) {
        setAnalyzeError("Studio cutout is still processing quota — tap Continue again to retry. We won't post with the original background.")
      }

      const firstSuggestion =
        apiFirst ||
        nextPhotos.find((p) => p.suggestion)?.suggestion ||
        null
      const firstDraft = firstSuggestion ? draftFromSuggestion(firstSuggestion) : null
      const stillMissingCount = nextPhotos.filter((p) => !p.suggestion?.title).length
      if (firstDraft?.itemTitle || firstSuggestion) {
        if (
          !opts?.onlyMissing &&
          !opts?.onlyUnprocessed &&
          !opts?.onlyWithoutStorage &&
          !skippedAutofillRef.current
        ) {
          setFormData((prev) => {
            const gender =
              firstDraft?.gender ||
              normalizeItemGender(firstSuggestion?.gender) ||
              prev.gender
            const kids = gender === "girls" || gender === "boys"
            return {
              ...prev,
              itemTitle: prev.itemTitle || firstDraft?.itemTitle || firstSuggestion?.title || "",
              category: firstDraft?.category || normalizeLaunchCategory(firstSuggestion?.category || prev.category),
              gender,
              description: prev.description || firstDraft?.description || firstSuggestion?.description || "",
              condition: firstDraft?.condition || firstSuggestion?.condition || prev.condition,
              brand: prev.brand || firstDraft?.brand || firstSuggestion?.brand || "",
              size: kids ? "" : prev.size || firstDraft?.size || "",
            }
          })
        }
        setAiApplied(true)
        if (
          stillMissingCount > 0 &&
          !skippedAutofillRef.current &&
          !opts?.onlyUnprocessed &&
          !opts?.onlyWithoutStorage
        ) {
          setAnalyzeError(
            `AI filled some items — ${stillMissingCount} still need a pass. Tap “Run AI on remaining” or fill those tabs yourself.`,
          )
        }
      } else if (
        !opts?.onlyMissing &&
        !opts?.onlyUnprocessed &&
        !opts?.onlyWithoutStorage &&
        !skippedAutofillRef.current
      ) {
        setAnalyzeError("AI could not read that photo. You can still fill the details manually.")
      } else if (opts?.onlyMissing) {
        setAnalyzeError("AI still couldn’t read those photos. Fill those tabs manually, or try again.")
      }

      const savedCount = nextPhotos.filter((p) => p.storagePath).length
      const readyCount = nextPhotos.filter((p) => (p.file != null && p.file.size > 0) || p.storagePath).length
      if (opts?.force && !opts?.onlyUnprocessed && !opts?.onlyWithoutStorage) {
        setLoginResumeNote(null)
        if (savedCount === nextPhotos.length) {
          setLoginResumeNote("Photos ready. You can review and submit.")
          void persistGiveDraft(undefined, nextPhotos)
        } else if (readyCount > 0) {
          setLoginResumeNote(
            "Photos are ready to upload when you submit (AI studio step was skipped or busy).",
          )
          void persistGiveDraft(undefined, nextPhotos)
        } else {
          setLoginResumeNote(
            "Photos still need attention. Go back to Photo, tap Continue, then submit.",
          )
          setStep(1)
        }
      }
      if (opts?.onlyMissing || opts?.onlyUnprocessed || opts?.onlyWithoutStorage) {
        setLoginResumeNote(null)
      }
      return photoItemsRef.current
    } catch (err) {
      if (gen !== analyzeGenRef.current) return photoItemsRef.current
      console.error("Photo analysis failed:", err)
      setPhotoItems(prev => prev.map(p => (p.status === "analyzing" ? { ...p, status: "pending" } : p)))
      setAnalyzeError(
        "Photo AI is busy right now. You can continue and fill details manually — studio cutouts will retry before you submit.",
      )
      if (opts?.force && !opts?.onlyUnprocessed && !opts?.onlyWithoutStorage) {
        setLoginResumeNote(
          "AI is busy, but your photos are saved for submit. Continue to Review when ready.",
        )
      }
      return photoItemsRef.current
    } finally {
      if (gen === analyzeGenRef.current) {
        analyzeInFlightRef.current = false
        setAnalyzing(false)
        if (skippedAutofillRef.current) {
          const left = photoItemsRef.current.filter((p) => !p.storagePath).length
          setBgKeptNote(
            left > 0
              ? `Title autofill skipped — studio cutouts still running (${left} left).`
              : "Studio cutouts finished — check Review for updated photos.",
          )
        }
      }
    }
  }

  /**
   * Before donation POST: wait briefly for in-flight studio, then force-save any
   * photo still missing storagePath via catalog upload (originals). Fixes the
   * video bug where Review showed photos but submit returned "Photo upload failed".
   */
  const ensurePhotosReadyForSubmit = async (): Promise<PhotoItem[]> => {
    const waitDeadline = Date.now() + 90_000
    while (analyzeInFlightRef.current && Date.now() < waitDeadline) {
      await new Promise((r) => setTimeout(r, 400))
    }

    let hydrated = await Promise.all(photoItemsRef.current.map(hydratePhotoFile))
    photoItemsRef.current = hydrated
    setPhotoItems(hydrated)

    const needSave = () =>
      photoItemsRef.current.filter((p) => !p.storagePath && p.file && p.file.size > 0)

    if (needSave().length > 0) {
      const n = needSave().length
      setLoginResumeNote(
        `Saving ${n} photo${n === 1 ? "" : "s"} so your drop can go live…`,
      )
      await analyzePhotos({
        mode: "store",
        force: true,
        photos: photoItemsRef.current,
        onlyWithoutStorage: true,
      })
      hydrated = photoItemsRef.current
    }

    // Second chance: rebuild File from preview if storage still missing.
    hydrated = await Promise.all(photoItemsRef.current.map(hydratePhotoFile))
    photoItemsRef.current = hydrated
    setPhotoItems(hydrated)
    if (needSave().length > 0) {
      const n = needSave().length
      setLoginResumeNote(`Retrying photo save (${n})…`)
      await analyzePhotos({
        mode: "store",
        force: true,
        photos: photoItemsRef.current,
        onlyWithoutStorage: true,
      })
    }

    return photoItemsRef.current
  }

  /** Wait for in-flight cutouts, then save any photo still missing storagePath. */
  const ensureStudioCutouts = async (rounds = 2): Promise<PhotoItem[]> => {
    for (let round = 0; round < rounds; round++) {
      const deadline = Date.now() + 240_000
      while (analyzeInFlightRef.current && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 400))
      }
      const hydrated = await Promise.all(photoItemsRef.current.map(hydratePhotoFile))
      photoItemsRef.current = hydrated
      setPhotoItems(hydrated)
      const needCutout = hydrated.filter((p) => !p.bgRemoved && p.file && p.file.size > 0)
      const needPath = hydrated.filter((p) => !p.storagePath && p.file && p.file.size > 0)
      if (needCutout.length === 0 && needPath.length === 0) return hydrated
      if (needCutout.length > 0) {
        setLoginResumeNote(
          `Finishing studio cutouts (${needCutout.length} photo${needCutout.length === 1 ? "" : "s"})…`,
        )
        await analyzePhotos({ force: true, photos: hydrated, onlyUnprocessed: true })
      }
      // Cutout can fail (quota) — still save originals so submit never posts empty.
      const stillNoPath = photoItemsRef.current.filter(
        (p) => !p.storagePath && p.file && p.file.size > 0,
      )
      if (stillNoPath.length > 0) {
        setLoginResumeNote(
          `Saving ${stillNoPath.length} photo${stillNoPath.length === 1 ? "" : "s"} for submit…`,
        )
        await analyzePhotos({
          mode: "store",
          force: true,
          photos: photoItemsRef.current,
          onlyWithoutStorage: true,
        })
      }
    }
    return photoItemsRef.current
  }

  /** Leave title autofill — go to Details now; studio cutouts keep running in the background. */
  const skipAutoFill = () => {
    skippedAutofillRef.current = true
    // Do NOT bump analyzeGenRef — that would cancel cutouts. Only clear the UI blocker.
    setAnalyzing(false)
    setAiApplied(true)
    setAnalyzeError(null)
    setBgKeptNote(
      "Title autofill skipped — studio image processing keeps running and will update on Review.",
    )
    void persistGiveDraft(2)
    setStep(2)
    // Ensure cutouts are running even if catalog was cancelled mid-flight.
    void analyzePhotos({ mode: "cutout", force: true, onlyUnprocessed: true })
  }

  // On Review: keep polishing any photos that still need studio cutouts (non-blocking).
  useEffect(() => {
    if (step !== 6) return
    if (!photoItemsRef.current.some((p) => !p.bgRemoved && p.file && p.file.size > 0)) return
    void analyzePhotos({ mode: "cutout", force: true, onlyUnprocessed: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- polish once when landing on Review
  }, [step])

  const groupsMissingAiTitle = () =>
    uniqueGroups.filter((gid) => {
      const title = (
        itemDrafts[gid]?.itemTitle ||
        photoItems.find((p) => p.groupId === gid)?.suggestion?.title ||
        ""
      ).trim()
      return !title || /^item\s*\d+$/i.test(title)
    })

  const retryAiForRemaining = () => {
    void analyzePhotos({ force: true, onlyMissing: true })
  }

  // Blocks "Continue" until the current step's required fields are actually
  function sizeRequiredForDraft(category: string, gender: string): boolean {
    const g = normalizeItemGender(gender)
    if (g === "girls" || g === "boys") return true // age band
    const cat = normalizeLaunchCategory(category)
    return (SIZE_REQUIRED_CATEGORIES as readonly string[]).includes(cat)
  }

  function draftHasRequiredSize(d: { category: string; gender: string; size?: string; age?: string }): boolean {
    const g = normalizeItemGender(d.gender)
    if (g === "girls" || g === "boys") return Boolean(String(d.age || d.size || "").trim())
    if (!sizeRequiredForDraft(d.category, d.gender)) return true
    return Boolean(String(d.size || "").trim())
  }

  function resolveGroupDraft(gid: number): ItemDraft {
    return (
      itemDrafts[gid] ||
      draftFromSuggestion(photoItems.find((p) => p.groupId === gid)?.suggestion) ||
      emptyItemDraft()
    )
  }

  /** What’s still missing so multi-item Continue isn’t a silent grey wall. */
  function draftIncompleteReasons(d: ItemDraft): string[] {
    const reasons: string[] = []
    if ((d.itemTitle || "").trim().length < 2) reasons.push("title")
    if (!(d.quantity >= 1)) reasons.push("quantity")
    if (!d.gender) reasons.push("for")
    if (!draftHasRequiredSize(d)) {
      const g = normalizeItemGender(d.gender)
      reasons.push(g === "girls" || g === "boys" ? "age" : "size")
    }
    return reasons
  }

  function incompleteMultiGroups(): { gid: number; label: number; reasons: string[] }[] {
    if (!isMultiItem) return []
    return uniqueGroups
      .map((gid) => ({
        gid,
        label: itemLabel(gid),
        reasons: draftIncompleteReasons(resolveGroupDraft(gid)),
      }))
      .filter((x) => x.reasons.length > 0)
  }

  // filled - the wizard has no native form submit per step, so nothing else
  // was stopping a donor from skipping straight through with blanks.
  function isStepValid(s: number): boolean {
    if (s === 1) return photoItems.length > 0
    if (s === 2) {
      if (isMultiItem) {
        return uniqueGroups.every((gid) => draftIncompleteReasons(resolveGroupDraft(gid)).length === 0)
      }
      return draftIncompleteReasons({
        itemTitle: formData.itemTitle,
        category: formData.category,
        gender: formData.gender,
        description: formData.description,
        condition: formData.condition,
        size: formData.size,
        brand: formData.brand,
        age: formData.age,
        defect: formData.defect,
        quantity: formData.quantity,
      }).length === 0
    }
    if (s === 3) {
      const hasContact =
        /^[6-9]\d{9}$/.test(formData.phone) ||
        formData.email.trim().includes("@") ||
        Boolean(getDonorToken())
      return (
        formData.firstName.trim().length >= 1 &&
        hasContact &&
        (formData.recognitionPreference !== "alias" || Boolean((formData.aliasName || profileUsername || "").trim()))
      )
    }
    if (s === 4) {
      // Handover step removed — always valid if somehow reached.
      return true
    }
    if (s === 5) {
      return (
        formData.recognitionPreference !== "alias" ||
        Boolean((formData.aliasName || profileUsername || "").trim())
      )
    }
    if (s === 6) {
      const pickup =
        withIndiaPincode(formData.pickupLocality, formData.pincode).trim() ||
        withIndiaPincode(formData.deliveryAddress, formData.pincode).trim()
      if (pickup.length < 2) return false
      if (pickup.length > PICKUP_LOCALITY_MAX) return false
      return true
    }
    if (s === 7) return formData.declaration && formData.acceptedTerms
    if (s === 8) return true
    return true
  }

  async function ensureStoredBeforeAuth(): Promise<boolean> {
    const blocked = canLeaveForLogin(photoItemsRef.current)
    if (!blocked) return true
    const missing = photoItemsRef.current.filter((p) => !p.storagePath)
    const canUpload = missing.every((p) => p.file && p.file.size > 0)
    if (!canUpload) {
      setLoginResumeNote(blocked)
      setStep(1)
      return false
    }
    await analyzePhotos({
      mode: "store",
      force: true,
      photos: photoItemsRef.current,
      onlyWithoutStorage: true,
    })
    const stillBlocked = canLeaveForLogin(photoItemsRef.current)
    if (stillBlocked) {
      setLoginResumeNote(stillBlocked)
      setAnalyzeError("Photo save failed. Try again before signing in.")
      return false
    }
    return true
  }

  async function leaveForAuth(draftStep: number): Promise<boolean> {
    const stored = await ensureStoredBeforeAuth()
    if (!stored) return false
    return persistGiveDraft(draftStep, photoItemsRef.current, { awaitingLogin: true })
  }

  const handleNext = async () => {
    if (step === 1) {
      track(AnalyticsEvent.donationStarted, { bulk: uploadMode === "bulk" })
      // Catalog-first: titles ASAP, then cutouts in background.
      await analyzePhotos({ mode: "catalog", force: true })
      await persistGiveDraft(2)
      void analyzePhotos({ mode: "cutout", force: true, onlyUnprocessed: true })
    }
    // After item details: go to Login step (guests) or verify session (logged in).
    if (step === 2) {
      // Snapshot with the open tab committed — setState is async so don't rely on it yet.
      const draftsNow: Record<number, ItemDraft> = isMultiItem
        ? { ...itemDrafts, [detailGroup]: itemDrafts[detailGroup] || activeDraft }
        : itemDrafts
      if (isMultiItem) {
        setItemDrafts(draftsNow)
        const incomplete = uniqueGroups
          .map((gid) => ({
            gid,
            label: itemLabel(gid),
            reasons: draftIncompleteReasons(
              draftsNow[gid] ||
                draftFromSuggestion(photoItems.find((p) => p.groupId === gid)?.suggestion) ||
                emptyItemDraft(),
            ),
          }))
          .filter((x) => x.reasons.length > 0)
        if (incomplete.length > 0) {
          const first = incomplete[0]
          setDetailGroupId(first.gid)
          setMultiIncompleteNote(
            incomplete.length === 1
              ? `Item ${first.label} still needs ${first.reasons.join(", ")} before you can continue.`
              : `Opened Item ${first.label}. Missing: ${incomplete
                  .map((x) => `#${x.label} (${x.reasons.join(", ")})`)
                  .join("; ")}.`,
          )
          return
        }
      } else if (
        draftIncompleteReasons({
          itemTitle: formData.itemTitle,
          category: formData.category,
          gender: formData.gender,
          description: formData.description,
          condition: formData.condition,
          size: formData.size,
          brand: formData.brand,
          age: formData.age,
          defect: formData.defect,
          quantity: formData.quantity,
        }).length > 0
      ) {
        setMultiIncompleteNote("Add title, for, and size (when required) before continuing.")
        return
      }
      setMultiIncompleteNote(null)
      await persistGiveDraft(2)
      if (!getDonorToken()) {
        const stored = await ensureStoredBeforeAuth()
        if (!stored) return
        await persistGiveDraft(8, photoItemsRef.current)
        setStep(8)
        return
      }
      try {
        const { profile } = await api.donor.get<{
          profile: { onboardedAt: string | null } | null
        }>("/api/donor/profile")
        if (!profile?.onboardedAt) {
          const left = await leaveForAuth(6)
          if (left) navigate(GIVE_ONBOARD_PATH)
          return
        }
      } catch {
        setLoggedIn(false)
        setStep(8)
        return
      }
    }
    if (step === 8) {
      const left = await leaveForAuth(6)
      if (left) navigate(GIVE_LOGIN_PATH)
      return
    }
    setStep(s => {
      const idx = steps.indexOf(s)
      const next = idx < steps.length - 1 ? steps[idx + 1] : s
      void persistGiveDraft(next)
      return next
    })
  }

  const handleSubmit = async () => {
    if (submitLockRef.current || isSubmitting) return
    submitLockRef.current = true
    setIsSubmitting(true)
    setSubmitFeedback(null)
    let partialSubmission: PartialGiveResult | null = null

    if (!getDonorToken()) {
      const left = await leaveForAuth(7)
      submitLockRef.current = false
      setIsSubmitting(false)
      if (left) navigate(GIVE_LOGIN_PATH)
      return
    }

    try {
      const pickup =
        withIndiaPincode(formData.pickupLocality, formData.pincode).trim() ||
        withIndiaPincode(formData.deliveryAddress, formData.pincode).trim()
      if (pickup.length < 2) {
        setSubmitFeedback({
          kind: "validation",
          title: "Pickup address needed",
          message: "Add a building or landmark on your account profile before posting.",
          tone: "error",
        })
        setIsSubmitting(false)
        setStep(6)
        setEditingAddress(true)
        return
      }
      if (pickup.length > PICKUP_LOCALITY_MAX) {
        setSubmitFeedback({
          kind: "validation",
          title: "Pickup address is too long",
          message: `Shorten the building or landmark on the review step (${pickup.length}/${PICKUP_LOCALITY_MAX} characters), then submit again.`,
          tone: "error",
        })
        setIsSubmitting(false)
        setStep(6)
        setEditingAddress(true)
        return
      }

      // Prefer ready storage paths; originals OK — server polishes cutouts async.
      // Critical: wait/save photos first — Review can show previews while studio is
      // still running with no storagePath, which used to POST empty and 400.
      setLoginResumeNote("Preparing photos for submit…")
      let hydrated = await ensurePhotosReadyForSubmit()
      hydrated = await Promise.all(hydrated.map(hydratePhotoFile))
      photoItemsRef.current = hydrated
      setPhotoItems(hydrated)

      const withPaths = hydrated.filter((p) => Boolean(p.storagePath))
      const pendingFiles = hydrated.filter(
        (p) => !p.storagePath && p.file && typeof p.file.size === "number" && p.file.size > 0,
      )
      if (withPaths.length === 0 && pendingFiles.length === 0) {
        setSubmitFeedback({
          kind: "upload",
          title: "Photos couldn’t be saved",
          message: "Go back to Photo, add them again, then submit.",
          tone: "error",
        })
        setLoginResumeNote(null)
        setIsSubmitting(false)
        setStep(1)
        return
      }
      setLoginResumeNote(null)

      const processedPaths: string[] = []
      const bgFlags: boolean[] = []
      for (const p of withPaths) {
        const original = p.originalStoragePath || (!p.bgRemoved ? p.storagePath : undefined)
        const modelled = p.modelledStoragePath || (p.bgRemoved ? p.storagePath : undefined)
        if (original) {
          processedPaths.push(original)
          bgFlags.push(false)
        }
        if (modelled && modelled !== original) {
          processedPaths.push(modelled)
          bgFlags.push(true)
        } else if (!original && p.storagePath) {
          processedPaths.push(p.storagePath)
          bgFlags.push(Boolean(p.bgRemoved))
        }
      }
      // Strict: never drop AI-only. Prefer re-uploading local files as originals.
      const hasOriginalPath = bgFlags.some((f) => f === false)
      const filesForOriginal = withPaths.filter((p) => p.file && p.file.size > 0)
      if (!hasOriginalPath && filesForOriginal.length === 0) {
        setSubmitFeedback({
          kind: "upload",
          title: "Original photos required",
          message: "Go back to Photo and re-add your pictures so we can keep both the AI and original images.",
          tone: "error",
        })
        setIsSubmitting(false)
        setStep(1)
        return
      }

      const kidsGender = formData.gender === "girls" || formData.gender === "boys"
      // Kids use age band on the Wall — never adult XS–XL size.
      const sizeForSubmit = kidsGender ? "" : formData.size
      const ageForSubmit = kidsGender ? formData.age : ""

      const payload: Record<string, string> = {
        itemTitle: formData.itemTitle,
        category: toStorageCategory(formData.category),
        gender: toStorageGender(formData.gender),
        description: formData.description.trim() || "Preloved piece ready for a new home.",
        condition: formData.condition,
        size: sizeForSubmit || ageForSubmit,
        quantity: String(formData.quantity),
        brand: formData.brand,
        age: ageForSubmit,
        defect: formData.defect,
        firstName: formData.firstName,
        lastName: formData.lastName,
        phone: formData.phone,
        email: formData.email,
        contactMethod: formData.contactMethod,
        recognitionPreference: formData.recognitionPreference,
        aliasName:
          formData.recognitionPreference === "alias"
            ? (formData.aliasName || profileUsername || "").replace(/^@/, "").trim()
            : formData.aliasName,
        pickupLocality: pickup,
        dateRange: formData.dateRange || "Flexible",
        timeWindow: formData.timeWindow || "Flexible",
        notes: formData.notes,
        declaration: "true",
        acceptedTerms: "true",
        giverLogistics: formData.giverLogistics || "porter_arranged",
        deliveryAddress: formData.deliveryAddress,
        porterPaidBy:
          formData.giverLogistics === "porter_arranged"
            ? formData.porterPaidBy || "receiver"
            : "",
        photoStoragePaths: JSON.stringify(processedPaths),
        photoBgRemoved: JSON.stringify(bgFlags),
        latitude: formData.latitude != null ? String(formData.latitude) : "",
        longitude: formData.longitude != null ? String(formData.longitude) : "",
      }

      const groups = Array.from(new Set(hydrated.map(p => p.groupId))).sort((a, b) => a - b)
      const acceptedItems = new Map<string, string>()
      // Bulk mode with 2+ item groups → one API call per item (separate Wall cards).
      const isBulk = uploadMode === "bulk" && groups.length > 1

      async function postDonation(
        body: typeof payload & { idempotencyKey: string },
        pending: PhotoItem[],
      ) {
        if (getDonorToken()) {
          if (pending.length === 0) {
            return api.donor.post<{
              reference: string
              itemId?: string
              imageProcessingStatus?: string
              idempotentReplay?: boolean
            }>("/api/donations", body)
          }
          const form = new FormData()
          Object.entries(body).forEach(([k, v]) => form.append(k, String(v)))
          pending.forEach((p) => {
            if (p.file && p.file.size > 0) form.append("photos", p.file)
          })
          return api.donor.postForm<{
            reference: string
            itemId?: string
            imageProcessingStatus?: string
            idempotentReplay?: boolean
          }>("/api/donations", form)
        }
        await persistGiveDraft(7, undefined, { awaitingLogin: true })
        throw new Error("Not signed in")
      }

      const kickPolish = (itemId?: string, status?: string) => {
        if (!itemId || status === "ready") return
        void api.donor
          .post("/api/donations/polish-item-images", { itemId })
          .catch((err) => console.warn("polish-item-images", err))
      }

      let result: { reference: string; itemId?: string; imageProcessingStatus?: string; idempotentReplay?: boolean }
      if (!isBulk) {
        const key = idempotencyKeyForGroup(itemIdempotencyRef.current, groups[0] ?? 0)
        const one = await postDonation({ ...payload, idempotencyKey: key }, pendingFiles)
        if (!acceptDonationResult(acceptedItems, key, one)) {
          throw new Error("The server returned a different item for this photo. It was not saved.")
        }
        result = one
        kickPolish(result.itemId, result.imageProcessingStatus)
      } else {
        const refs: string[] = []
        const failures: string[] = []
        await mapPool(groups, 3, async (gid) => {
          const groupPhotos = hydrated.filter(p => p.groupId === gid)
          const sug = groupPhotos.find(p => p.suggestion)?.suggestion
          const draft = itemDrafts[gid] || draftFromSuggestion(sug)
          const withPath = groupPhotos.filter((p) => p.storagePath)
          const paths: string[] = []
          const groupBgFlags: boolean[] = []
          for (const p of withPath) {
            const original = p.originalStoragePath || (!p.bgRemoved ? p.storagePath : undefined)
            const modelled = p.modelledStoragePath || (p.bgRemoved ? p.storagePath : undefined)
            if (original) {
              paths.push(original)
              groupBgFlags.push(false)
            }
            if (modelled && modelled !== original) {
              paths.push(modelled)
              groupBgFlags.push(true)
            } else if (!original && p.storagePath) {
              paths.push(p.storagePath)
              groupBgFlags.push(Boolean(p.bgRemoved))
            }
          }
          const pending = groupPhotos.filter(
            (p) => !p.storagePath && p.file && typeof p.file.size === "number" && p.file.size > 0,
          )
          if (paths.length === 0 && pending.length === 0) {
            failures.push(`Item ${itemLabel(gid)}: needs a photo`)
            return
          }
          const kidsGender = draft.gender === "girls" || draft.gender === "boys"
          const sizeForItem = kidsGender ? "" : draft.size
          const ageForItem = kidsGender ? draft.age || draft.size : ""
          try {
            const key = idempotencyKeyForGroup(itemIdempotencyRef.current, gid)
            const one = await postDonation(
              {
                ...payload,
                idempotencyKey: key,
                itemTitle: draft.itemTitle.trim() || sug?.title || `Item ${itemLabel(gid)}`,
                category: toStorageCategory(draft.category || sug?.category || "Tops"),
                gender: toStorageGender(draft.gender || sug?.gender || "unisex"),
                description:
                  draft.description.trim() ||
                  sug?.description ||
                  "Preloved item ready to Relove.",
                condition: draft.condition || sug?.condition || "Good",
                size: sizeForItem || ageForItem,
                brand: draft.brand || sug?.brand || "",
                age: ageForItem,
                defect: draft.defect || "",
                quantity: String(draft.quantity || 1),
                photoStoragePaths: JSON.stringify(paths),
                photoBgRemoved: JSON.stringify(groupBgFlags),
              },
              pending
            )
            if (!acceptDonationResult(acceptedItems, key, one)) {
              failures.push(`Item ${itemLabel(gid)}: that photo was not saved on its own item.`)
              return
            }
            if (one?.reference) refs.push(one.reference)
            kickPolish(one?.itemId, one?.imageProcessingStatus)
          } catch (err: any) {
            failures.push(`Item ${itemLabel(gid)}: ${err?.message || "upload failed"}`)
          }
        })
        if (refs.length === 0) {
          throw new Error(failures[0] || "Couldn't upload your items. Please try again.")
        }
        if (failures.length > 0) {
          partialSubmission = { submittedCount: refs.length, failedCount: failures.length }
        }
        result = { reference: refs[refs.length - 1] }
      }
      track(AnalyticsEvent.donationSubmitted, {
        reference: result.reference,
        category: formData.category,
        bulk: isBulk,
      })
      setIsSubmitting(false)
      clearGiveDraft()
      itemIdempotencyRef.current.clear()
      setPhotoItems([])
      setItemDrafts({})
      setAiApplied(false)
      skippedAutofillRef.current = false
      analyzeGenRef.current += 1
      analyzeInFlightRef.current = false
      navigate(`/give/success/${result.reference}?logistics=${encodeURIComponent(formData.giverLogistics || "porter_arranged")}`, {
        state: partialSubmission ? { partialSubmission } : undefined,
      })
    } catch (error: any) {
      console.error("Error saving donation:", error)
      const msg = String(error?.message || "")
      if (/not signed in|401|unauthorized|session/i.test(msg)) {
        setLoggedIn(false)
        setSubmitFeedback({
          kind: "validation",
          title: "Sign in again",
          message: "Your session expired. Sign in again to continue your drop.",
          tone: "warn",
        })
        setIsSubmitting(false)
        const left = await leaveForAuth(7)
        if (left) navigate(GIVE_LOGIN_PATH)
        return
      }
      await persistGiveDraft(7)
      track(AnalyticsEvent.donationFailed, {
        category: formData.category,
        message: error?.message || "unknown",
      })
      setSubmitFeedback(getGiveSubmissionFeedback(error))
      setIsSubmitting(false)
    } finally {
      submitLockRef.current = false
    }
  }

  return (
    <GiveFlowProvider value={{
      step,
      setStep,
      steps,
      STEP_LABELS,
      loginResumeNote,
      setLoginResumeNote,
      clearGiveDraft,
      photoItems,
      setPhotoItems,
      itemDrafts,
      setItemDrafts,
      aiApplied,
      setAiApplied,
      skippedAutofillRef,
      analyzeGenRef,
      analyzeInFlightRef,
      analyzing,
      setAnalyzing,
      uploadMode,
      setUploadMode,
      activeGroupId,
      setActiveGroupId,
      compressingPhotos,
      uniqueGroupCount,
      photoLimit,
      itemSlots,
      itemLabel,
      countInGroup,
      openCamera,
      openGallery,
      photoPickError,
      startNewItemGroup,
      assignPhotoToActiveItem,
      removePhoto,
      skipAutoFill,
      analyzeError,
      sensitivePhotoWarning,
      bgKeptNote,
      cameraInputRef,
      galleryInputRef,
      handlePhotoUpload,
      isMultiItem,
      groupsMissingAiTitle,
      retryAiForRemaining,
      uniqueGroups,
      detailGroup,
      setDetailGroupId,
      draftIncompleteReasons,
      resolveGroupDraft,
      selectDetailGroup,
      incompleteMultiGroups,
      multiIncompleteNote,
      activeDraft,
      formData,
      setFormData,
      patchActiveDraft,
      sizeRequiredForDraft,
      profileUsername,
      hasSavedAddress,
      editingAddress,
      setEditingAddress,
      submitFeedback,
      setSubmitFeedback,
      handleBack,
      handleSubmit,
      isSubmitting,
      handleNext,
      isStepValid,
      loggedIn,
    }}>
      <GiveView />
    </GiveFlowProvider>
  )
}
