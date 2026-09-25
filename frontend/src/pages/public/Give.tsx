import React, { useState, useRef, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "motion/react"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { AddressAutocomplete } from "@/components/ui/AddressAutocomplete"
import { Textarea } from "@/components/ui/Textarea"
import { Camera, ImagePlus, X, Sparkles, Loader2, UserCheck } from "lucide-react"
import { api, resolveImageUrl } from "@/lib/api"
import { getDonorToken, getDonorPrefs } from "@/lib/donorSession"
import { lookupLocalities } from "@/lib/mumbaiPincodes"
import { LegalAccept, LegalReadMore } from "@/components/ui/LegalAccept"
import { PrivacyBuildingNotice, privacyAddressWarning, PrivacyPhotoNotice } from "@/components/ui/PrivacyBuildingNotice"
import { compressImageFiles } from "@/lib/compressImage"
import { AnalyticsEvent, track } from "@/lib/analytics"
import { extractIndiaPincode, withIndiaPincode } from "@/lib/logisticsLinks"
import {
  APPAREL_SIZES,
  DROP_CATEGORY_OPTIONS,
  DROP_GENDER_OPTIONS,
  KIDS_AGE_BANDS,
  SIZE_REQUIRED_CATEGORIES,
  normalizeItemGender,
  normalizeLaunchCategory,
  toStorageCategory,
  toStorageGender,
  GIVER_LOGISTICS_LABELS,
  GIVER_LOGISTICS_PICK_OPTIONS,
  giverLogisticsLabel,
  type GiverLogistics,
} from "@shared/taxonomy"

/** Must match shared donation schema `pickupLocality` max (profile address can be longer). */
const PICKUP_LOCALITY_MAX = 500
/** Multiple-items Drop: max photos (= max Wall cards when 1 photo each). */
const BULK_PHOTO_LIMIT = 30
/** One item: angles of the same piece. */
const SINGLE_PHOTO_LIMIT = 5

interface PhotoItem {
  file: File
  previewUrl: string
  status: "pending" | "analyzing" | "done" | "error"
  storagePath?: string
  groupId: number
  suggestion?: ItemSuggestion
  bgRemoved?: boolean
  sensitiveDetected?: boolean
  sensitiveReason?: string | null
}

/** After login, drafts restore preview data-URLs with empty File placeholders — rebuild real Files for upload. */
async function hydratePhotoFile(p: PhotoItem): Promise<PhotoItem> {
  if (p.storagePath) return p
  if (p.file && typeof p.file.size === "number" && p.file.size > 0) return p
  const url = p.previewUrl || ""
  if (!url.startsWith("data:") && !url.startsWith("blob:") && !url.startsWith("http")) return p
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    if (!blob.size) return p
    const name = p.file?.name || "photo.jpg"
    const type = blob.type || "image/jpeg"
    return {
      ...p,
      file: new File([blob], name, { type }),
      status: p.storagePath ? "done" : "pending",
    }
  } catch {
    return p
  }
}

interface ItemSuggestion {
  category: string
  title: string
  description: string
  condition: string
  brand: string | null
  gender: string
  size?: string | null
  sensitiveDetected?: boolean
  sensitiveReason?: string | null
}

/** Per-item fields when dropping multiple garments in one flow. */
type ItemDraft = {
  itemTitle: string
  category: string
  gender: string
  description: string
  condition: string
  size: string
  brand: string
  age: string
  defect: string
  quantity: number
}

function emptyItemDraft(): ItemDraft {
  return {
    itemTitle: "",
    category: "Tops",
    gender: "unisex",
    description: "",
    condition: "Good",
    size: "",
    brand: "",
    age: "",
    defect: "",
    quantity: 1,
  }
}

function draftFromSuggestion(sug?: ItemSuggestion | null): ItemDraft {
  const base = emptyItemDraft()
  if (!sug) return base
  const gender = normalizeItemGender(sug.gender) || base.gender
  const kids = gender === "girls" || gender === "boys"
  const sizeRaw = String(sug.size || "").trim()
  return {
    ...base,
    itemTitle: sug.title || "",
    category: normalizeLaunchCategory(sug.category),
    gender,
    description: sug.description || "",
    condition: sug.condition || "Good",
    brand: sug.brand || "",
    size: sizeRaw,
    age: kids ? sizeRaw : "",
  }
}

const DATE_RANGE_PRESETS = ["24 hr", "48 hr", "1 week", "Flexible"]
const TIME_WINDOW_PRESETS = ["Mornings", "Afternoons", "Evenings", "Weekends only"]

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
  /** Queue force re-analyze after login hydrate (avoids empty-File analyze). */
  const [pendingForceAnalyze, setPendingForceAnalyze] = useState<PhotoItem[] | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
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
        photoItems?: Array<{ previewUrl: string; status: string; storagePath?: string; groupId: number; fileName?: string }>
        step?: number
        uploadMode?: "single" | "bulk"
        activeGroupId?: number
        itemDrafts?: typeof itemDrafts
        awaitingLogin?: boolean
      }
      const token = getDonorToken()
      const midLoginResume = Boolean(draft.awaitingLogin) && Boolean(token)
      if (draft.formData) setFormData((prev) => ({ ...prev, ...draft.formData }))
      if (draft.uploadMode) setUploadMode(draft.uploadMode)
      if (typeof draft.activeGroupId === "number") setActiveGroupId(draft.activeGroupId)
      if (draft.itemDrafts) setItemDrafts(draft.itemDrafts)
      if (Array.isArray(draft.photoItems) && draft.photoItems.length) {
        const restored = draft.photoItems.map((p) => {
          const previewUrl = p.previewUrl || ""
          const fromStorage = p.storagePath ? resolveImageUrl(p.storagePath) : null
          const url =
            previewUrl.startsWith("data:") || previewUrl.startsWith("http")
              ? previewUrl
              : fromStorage || previewUrl
          // Never mark "done" without a real storagePath — empty File + fake done
          // caused "Add at least one photo" while thumbnails still showed.
          const hasPath = Boolean(p.storagePath)
          return {
            file: new File([], p.fileName || "photo.jpg"),
            previewUrl: url,
            status: (hasPath ? "done" : "pending") as PhotoItem["status"],
            storagePath: p.storagePath,
            groupId: p.groupId ?? 0,
          }
        })
        setPhotoItems(restored)
        const hasUsefulTitles = Object.values(draft.itemDrafts || {}).some((d) => {
          const t = (d?.itemTitle || "").trim()
          return t.length > 0 && !/^item\s*\d+$/i.test(t)
        })
        // Skip auto AI on Continue when storage is ready OR titles already filled (refresh mid-drop).
        setAiApplied(restored.every((p) => Boolean(p.storagePath)) || (hasUsefulTitles && !midLoginResume))

        // Rebuild File blobs from data-URL previews; only force-reanalyze after real login.
        void Promise.all(restored.map(hydratePhotoFile)).then((hydrated) => {
          setPhotoItems(hydrated)
          if (!token) return
          const missingPath = hydrated.filter((p) => !p.storagePath)
          if (!midLoginResume) {
            if (hydrated.length > 0) {
              setLoginResumeNote("Draft restored — continue where you left off.")
            }
            return
          }
          if (missingPath.length === 0) {
            setLoginResumeNote("Welcome back — your drop draft was restored. Review and submit when ready.")
            return
          }
          const recoverable = missingPath.filter(
            (p) => p.file && typeof p.file.size === "number" && p.file.size > 0,
          )
          if (recoverable.length === 0) {
            setLoginResumeNote(
              "Welcome back — some photos could not be recovered. Please add them again on the Photo step, then continue.",
            )
            setAiApplied(false)
            setStep(1)
            return
          }
          setLoginResumeNote("Welcome back — reconnecting your photos. This may take a moment…")
          setAiApplied(false)
          setPendingForceAnalyze(hydrated)
        })
      } else if (token && typeof draft.step === "number" && draft.step >= 2) {
        setLoginResumeNote("Draft restored — continue where you left off.")
      }
      // Resume exact step; if guest draft was on Login (8) and user is now logged in → Review (6).
      if (typeof draft.step === "number" && draft.step >= 1) {
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

  async function previewToPersistable(url: string): Promise<string> {
    if (!url.startsWith("blob:")) return url
    try {
      const res = await fetch(url)
      const blob = await res.blob()
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ""))
        reader.onerror = () => reject(new Error("read failed"))
        reader.readAsDataURL(blob)
      })
    } catch {
      return url
    }
  }

  async function persistGiveDraft(
    nextStep?: number,
    photosOverride?: PhotoItem[],
    opts?: { awaitingLogin?: boolean },
  ) {
    try {
      const source = photosOverride ?? photoItems
      const photos = await Promise.all(
        source.map(async (p) => ({
          previewUrl: p.storagePath
            ? resolveImageUrl(p.storagePath) || (await previewToPersistable(p.previewUrl))
            : await previewToPersistable(p.previewUrl),
          status: p.storagePath ? "done" : p.status,
          storagePath: p.storagePath,
          groupId: p.groupId,
          fileName: p.file?.name,
        })),
      )
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
    } catch {
      /* ignore quota */
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
            : `Limit reached: ${SINGLE_PHOTO_LIMIT}/${SINGLE_PHOTO_LIMIT} photos for this item. Remove one to add another.`,
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
            : `Only ${room} more photo${room === 1 ? "" : "s"} left (max ${SINGLE_PHOTO_LIMIT}). Added what fits.`,
        )
      }
      setPhotoItems((prev) => {
        if (uploadMode === "single") {
          return [
            ...prev,
            ...files.map((file) => {
              const named =
                file.name && file.name !== "image.jpg" && file.name !== "blob"
                  ? file
                  : new File([file], `photo-${Date.now()}.jpg`, {
                      type: file.type || "image/jpeg",
                      lastModified: Date.now(),
                    })
              return {
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
            const named =
              file.name && file.name !== "image.jpg" && file.name !== "blob"
                ? file
                : new File([file], `photo-${Date.now()}-${i}.jpg`, {
                    type: file.type || "image/jpeg",
                    lastModified: Date.now(),
                  })
            return {
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
  // `onlyUnprocessed` = studio cutout/upload for photos still missing storagePath
  // (Skip title autofill must never cancel this path).
  const analyzePhotos = async (opts?: {
    force?: boolean
    photos?: PhotoItem[]
    onlyMissing?: boolean
    onlyUnprocessed?: boolean
    mode?: "catalog" | "cutout" | "full"
  }): Promise<PhotoItem[] | null> => {
    const mode = opts?.mode || (opts?.onlyUnprocessed ? "cutout" : "full")
    const allSource = opts?.photos ?? photoItemsRef.current
    let source = opts?.onlyUnprocessed
      ? allSource.filter((p) => !p.bgRemoved && p.file && p.file.size > 0)
      : opts?.onlyMissing
        ? allSource.filter((p) => {
            const title = (itemDrafts[p.groupId]?.itemTitle || p.suggestion?.title || "").trim()
            return !title || /^item\s*\d+$/i.test(title)
          })
        : allSource
    if (source.length === 0) return allSource

    if (analyzeInFlightRef.current) {
      if (!opts?.force && !opts?.onlyUnprocessed && !opts?.onlyMissing && mode !== "cutout") return null
      const deadline = Date.now() + 240_000
      while (analyzeInFlightRef.current && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 400))
      }
      if (analyzeInFlightRef.current) return photoItemsRef.current
      if (opts?.onlyUnprocessed || mode === "cutout") {
        source = photoItemsRef.current.filter((p) => !p.bgRemoved && p.file && p.file.size > 0)
        if (source.length === 0) return photoItemsRef.current
      }
    }

    if (!opts?.force && !opts?.onlyMissing && !opts?.onlyUnprocessed && mode !== "cutout" && aiApplied) {
      return allSource
    }

    if (!opts?.onlyMissing && !opts?.onlyUnprocessed && mode !== "cutout") skippedAutofillRef.current = false
    // Cutout / polish passes must preserve titles the user already typed.
    if (opts?.onlyUnprocessed || mode === "cutout") skippedAutofillRef.current = true

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
      if (!opts?.onlyMissing && !opts?.onlyUnprocessed) {
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
        chunk.forEach((p, j) => {
          if (!p.file || p.file.size < 1) return
          const i = start + j
          const ext = p.file.name.includes(".") ? p.file.name.split(".").pop() : "jpg"
          form.append("photos", p.file, `give-${i}.${ext || "jpg"}`)
        })
        if (![...form.keys()].filter((k) => k === "photos").length) continue
        try {
          const { results: chunkResults } = await api.postForm<{
            results: (AnalyzeOk | AnalyzeFail)[]
            firstSuggestion?: ItemSuggestion | null
          }>(`/api/donations/analyze-photos?mode=${encodeURIComponent(mode)}`, form)
          chunk.forEach((_p, j) => {
            const i = start + j
            const byName = chunkResults.find((r) => {
              const name = r.originalName || r.filename || ""
              return name.startsWith(`give-${i}.`)
            })
            results[i] = byName || chunkResults[j] || { ok: false, error: "no result" }
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
          return {
            ...p,
            status: "done" as const,
            storagePath,
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
        skippedAutofillRef.current || Boolean(opts?.onlyMissing) || Boolean(opts?.onlyUnprocessed)
      setPhotoItems((prev) => {
        if (preserveUser || opts?.onlyMissing || opts?.onlyUnprocessed) {
          const merged = prev.map((p) => {
            const updated = nextPhotos.find(
              (n) =>
                n.groupId === p.groupId &&
                (n.file === p.file ||
                  n.file?.name === p.file?.name ||
                  (n.previewUrl && n.previewUrl === p.previewUrl) ||
                  (p.storagePath && n.storagePath === p.storagePath)),
            )
            if (updated) {
              return {
                ...p,
                ...updated,
                file: updated.file?.size ? updated.file : p.file,
                storagePath: updated.storagePath || p.storagePath,
                previewUrl: updated.storagePath
                  ? resolveImageUrl(updated.storagePath) || updated.previewUrl
                  : updated.previewUrl || p.previewUrl,
              }
            }
            const byGroup = nextPhotos.filter((n) => n.groupId === p.groupId)
            const prevInGroup = prev.filter((x) => x.groupId === p.groupId)
            const idxInGroup = prevInGroup.indexOf(p)
            const fallback = byGroup[idxInGroup]
            if (!fallback) return p
            return {
              ...p,
              ...fallback,
              file: fallback.file?.size ? fallback.file : p.file,
              storagePath: fallback.storagePath || p.storagePath,
            }
          })
          photoItemsRef.current = merged
          return merged
        }
        photoItemsRef.current = nextPhotos
        return nextPhotos
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
      if (!opts?.onlyMissing && !opts?.onlyUnprocessed && !skippedAutofillRef.current) {
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
        if (!opts?.onlyMissing && !opts?.onlyUnprocessed && !skippedAutofillRef.current) {
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
        if (stillMissingCount > 0 && !skippedAutofillRef.current && !opts?.onlyUnprocessed) {
          setAnalyzeError(
            `AI filled some items — ${stillMissingCount} still need a pass. Tap “Run AI on remaining” or fill those tabs yourself.`,
          )
        }
      } else if (!opts?.onlyMissing && !opts?.onlyUnprocessed && !skippedAutofillRef.current) {
        setAnalyzeError("AI could not read that photo. You can still fill the details manually.")
      } else if (opts?.onlyMissing) {
        setAnalyzeError("AI still couldn’t read those photos. Fill those tabs manually, or try again.")
      }

      const savedCount = nextPhotos.filter((p) => p.storagePath).length
      const readyCount = nextPhotos.filter((p) => p.file?.size > 0 || p.storagePath).length
      if (opts?.force && !opts?.onlyUnprocessed) {
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
      if (opts?.onlyMissing || opts?.onlyUnprocessed) {
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
      if (opts?.force && !opts?.onlyUnprocessed) {
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

  /** Wait for in-flight cutouts, then retry any photo still missing storagePath. Never posts originals. */
  const ensureStudioCutouts = async (rounds = 2): Promise<PhotoItem[]> => {
    for (let round = 0; round < rounds; round++) {
      const deadline = Date.now() + 240_000
      while (analyzeInFlightRef.current && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 400))
      }
      const hydrated = await Promise.all(photoItemsRef.current.map(hydratePhotoFile))
      photoItemsRef.current = hydrated
      setPhotoItems(hydrated)
      const need = hydrated.filter((p) => !p.storagePath && p.file && p.file.size > 0)
      if (need.length === 0) return hydrated
      setLoginResumeNote(
        `Finishing studio cutouts (${need.length} photo${need.length === 1 ? "" : "s"})… Title autofill skip does not skip this.`,
      )
      await analyzePhotos({ force: true, photos: hydrated, onlyUnprocessed: true })
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

  // After mid-drop login: hydrate finished → force analyze/upload so submit isn't "no photos".
  useEffect(() => {
    if (!pendingForceAnalyze) return
    const photos = pendingForceAnalyze
    setPendingForceAnalyze(null)
    void analyzePhotos({ force: true, photos })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per queued recover
  }, [pendingForceAnalyze])

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
        setStep(8)
        return
      }
      try {
        const { profile } = await api.donor.get<{
          profile: { onboardedAt: string | null } | null
        }>("/api/donor/profile")
        if (!profile?.onboardedAt) {
          await persistGiveDraft(6, undefined, { awaitingLogin: true })
          navigate(GIVE_ONBOARD_PATH)
          return
        }
      } catch {
        setLoggedIn(false)
        setStep(8)
        return
      }
    }
    if (step === 8) {
      await persistGiveDraft(6, undefined, { awaitingLogin: true })
      navigate(GIVE_LOGIN_PATH)
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
    setIsSubmitting(true)
    setSubmitError(null)

    if (!getDonorToken()) {
      await persistGiveDraft(7, undefined, { awaitingLogin: true })
      setIsSubmitting(false)
      navigate(GIVE_LOGIN_PATH)
      return
    }

    try {
      const pickup =
        withIndiaPincode(formData.pickupLocality, formData.pincode).trim() ||
        withIndiaPincode(formData.deliveryAddress, formData.pincode).trim()
      if (pickup.length < 2) {
        setSubmitError("Add a building / landmark on your account profile before posting.")
        setIsSubmitting(false)
        setStep(6)
        setEditingAddress(true)
        return
      }
      if (pickup.length > PICKUP_LOCALITY_MAX) {
        setSubmitError(
          `Your pickup address is too long (${pickup.length}/${PICKUP_LOCALITY_MAX} characters). Shorten building / landmark on the review step, then submit again.`,
        )
        setIsSubmitting(false)
        setStep(6)
        setEditingAddress(true)
        return
      }

      // Prefer ready storage paths; originals OK — server polishes cutouts async.
      const hydrated = await Promise.all(photoItemsRef.current.map(hydratePhotoFile))
      photoItemsRef.current = hydrated
      setPhotoItems(hydrated)

      const withPaths = hydrated.filter((p) => Boolean(p.storagePath))
      const pendingFiles = hydrated.filter(
        (p) => !p.storagePath && p.file && typeof p.file.size === "number" && p.file.size > 0,
      )
      if (withPaths.length === 0 && pendingFiles.length === 0) {
        setSubmitError("Add at least one photo before submitting.")
        setIsSubmitting(false)
        setStep(1)
        return
      }
      setLoginResumeNote(null)

      const processedPaths = withPaths.map((p) => p.storagePath as string)
      const bgFlags = withPaths.map((p) => Boolean(p.bgRemoved))

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
        // Ops-manual courier: schedule + book after claim (no Give handover step).
        giverLogistics: "porter_arranged",
        deliveryAddress: formData.deliveryAddress,
        porterPaidBy: "receiver",
        photoStoragePaths: JSON.stringify(processedPaths),
        photoBgRemoved: JSON.stringify(bgFlags),
        latitude: formData.latitude != null ? String(formData.latitude) : "",
        longitude: formData.longitude != null ? String(formData.longitude) : "",
      }

      const groups = Array.from(new Set(hydrated.map(p => p.groupId))).sort((a, b) => a - b)
      // Bulk mode with 2+ item groups → one API call per item (separate Wall cards).
      const isBulk = uploadMode === "bulk" && groups.length > 1

      async function postDonation(body: typeof payload, pending: PhotoItem[]) {
        if (getDonorToken()) {
          if (pending.length === 0) {
            return api.donor.post<{ reference: string; itemId?: string; imageProcessingStatus?: string }>(
              "/api/donations",
              body,
            )
          }
          const form = new FormData()
          Object.entries(body).forEach(([k, v]) => form.append(k, String(v)))
          pending.forEach(p => form.append("photos", p.file))
          return api.donor.postForm<{ reference: string; itemId?: string; imageProcessingStatus?: string }>(
            "/api/donations",
            form,
          )
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

      let result: { reference: string; itemId?: string; imageProcessingStatus?: string }
      if (!isBulk) {
        result = await postDonation(payload, pendingFiles)
        kickPolish(result.itemId, result.imageProcessingStatus)
      } else {
        const refs: string[] = []
        const failures: string[] = []
        for (const gid of groups) {
          const groupPhotos = hydrated.filter(p => p.groupId === gid)
          const sug = groupPhotos.find(p => p.suggestion)?.suggestion
          const draft = itemDrafts[gid] || draftFromSuggestion(sug)
          const withPath = groupPhotos.filter((p) => p.storagePath)
          const paths = withPath.map((p) => p.storagePath as string)
          const pending = groupPhotos.filter(
            (p) => !p.storagePath && p.file && typeof p.file.size === "number" && p.file.size > 0,
          )
          if (paths.length === 0 && pending.length === 0) {
            failures.push(`Item ${itemLabel(gid)}: needs a photo`)
            continue
          }
          const kidsGender = draft.gender === "girls" || draft.gender === "boys"
          const sizeForItem = kidsGender ? "" : draft.size
          const ageForItem = kidsGender ? draft.age || draft.size : ""
          try {
            const one = await postDonation(
              {
                ...payload,
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
                photoBgRemoved: JSON.stringify(withPath.map((p) => Boolean(p.bgRemoved))),
              },
              pending
            )
            if (one?.reference) refs.push(one.reference)
            kickPolish(one?.itemId, one?.imageProcessingStatus)
          } catch (err: any) {
            failures.push(`Item ${itemLabel(gid)}: ${err?.message || "upload failed"}`)
          }
        }
        if (refs.length === 0) {
          throw new Error(failures[0] || "Couldn't upload your items. Please try again.")
        }
        if (failures.length > 0) {
          setSubmitError(
            `${refs.length} item${refs.length === 1 ? "" : "s"} uploaded. ${failures.length} failed — ${failures.join("; ")}`,
          )
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
      navigate(`/give/success/${result.reference}?logistics=${encodeURIComponent("porter_arranged")}`)
    } catch (error: any) {
      console.error("Error saving donation:", error)
      const msg = String(error?.message || "")
      if (/not signed in|401|unauthorized|session/i.test(msg)) {
        await persistGiveDraft(7, undefined, { awaitingLogin: true })
        setLoggedIn(false)
        setSubmitError("Your session expired. Sign in again to finish — your drop draft is saved.")
        setIsSubmitting(false)
        navigate(GIVE_LOGIN_PATH)
        return
      }
      await persistGiveDraft(7)
      track(AnalyticsEvent.donationFailed, {
        category: formData.category,
        message: error?.message || "unknown",
      })
      setSubmitError(error?.message || "Failed to submit. Please try again.")
      setIsSubmitting(false)
    }
  }

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-5 sm:py-8 md:py-16 min-w-0">
      <div className="mb-5 sm:mb-8">
        <h1 className="text-3xl sm:text-4xl font-display font-black uppercase tracking-tight">Drop an item</h1>
        <div className="mt-4 sm:mt-6 flex items-center gap-1 sm:gap-1.5">
           {steps.map(s => (
             <div key={s} className="flex-1 flex flex-col gap-1 min-w-0">
               <div className={`h-1 sm:h-1.5 rounded-none ${steps.indexOf(s) <= steps.indexOf(step) ? "bg-foreground" : "bg-black/10"}`} />
               <span
                 className={`text-[8px] sm:text-[10px] font-black uppercase tracking-wide truncate ${
                   s === step ? "text-foreground" : "text-foreground-muted"
                 }`}
               >
                 {STEP_LABELS[s] || s}
               </span>
             </div>
           ))}
        </div>
      </div>

      {loginResumeNote && (
        <div
          className="mb-4 border-2 border-foreground bg-accent-pink/20 px-3 py-3 text-sm font-bold flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"
          data-testid="login-resume-note"
          role="status"
        >
          <span className="min-w-0">{loginResumeNote}</span>
          <div className="flex gap-3 shrink-0">
            <button
              type="button"
              className="text-xs uppercase tracking-widest underline"
              onClick={() => {
                clearGiveDraft()
                setLoginResumeNote(null)
                setPhotoItems([])
                setItemDrafts({})
                setAiApplied(false)
                skippedAutofillRef.current = false
                analyzeGenRef.current += 1
                analyzeInFlightRef.current = false
                setAnalyzing(false)
                setStep(1)
                setUploadMode("single")
              }}
              data-testid="clear-give-draft"
            >
              Start fresh
            </button>
            <button
              type="button"
              className="text-xs uppercase tracking-widest underline"
              onClick={() => setLoginResumeNote(null)}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="bg-white border border-foreground sm:border-2 p-4 sm:p-6 md:p-8 shadow-[2px_2px_0px_rgba(0,0,0,1)] sm:shadow-[8px_8px_0px_rgba(0,0,0,1)] min-h-0 sm:min-h-[500px] flex flex-col min-w-0 overflow-hidden">
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex flex-col gap-6 flex-1"
            >
              <div>
                <h2 className="text-3xl font-display font-bold uppercase mb-2">Drop something. Pass it on.</h2>
                <p className="text-foreground-muted">
                  Take photos or choose from your gallery. We will ask for the details next.
                </p>
              </div>

              <PrivacyPhotoNotice />

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={analyzing || compressingPhotos}
                  title={analyzing ? "Finish or skip AI before switching mode" : undefined}
                  onClick={() => {
                    if (analyzing || compressingPhotos) return
                    setUploadMode("single")
                    setActiveGroupId(0)
                    setPhotoItems((prev) => prev.map((p) => ({ ...p, groupId: 0 })))
                  }}
                  className={`h-10 sm:h-12 border border-foreground sm:border-2 text-[11px] sm:text-xs font-black uppercase tracking-wide sm:tracking-widest disabled:opacity-40 disabled:cursor-not-allowed ${
                    uploadMode === "single" ? "bg-accent-pink" : "bg-white hover:bg-black/5"
                  }`}
                >
                  One Item
                </button>
                <button
                  type="button"
                  disabled={analyzing || compressingPhotos}
                  title={analyzing ? "Finish or skip AI before switching mode" : undefined}
                  onClick={() => {
                    if (analyzing || compressingPhotos) return
                    setUploadMode("bulk")
                    // Split existing One Item photos into separate listings.
                    setPhotoItems((prev) => {
                      if (prev.length <= 1) {
                        setActiveGroupId(prev[0]?.groupId ?? 0)
                        return prev
                      }
                      const next = prev.map((p, i) => ({ ...p, groupId: i }))
                      setActiveGroupId(next.length - 1)
                      setDetailGroupId(0)
                      return next
                    })
                    setAiApplied(false)
                  }}
                  className={`h-10 sm:h-12 border border-foreground sm:border-2 text-[11px] sm:text-xs font-black uppercase tracking-wide sm:tracking-widest disabled:opacity-40 disabled:cursor-not-allowed ${
                    uploadMode === "bulk" ? "bg-accent-pink" : "bg-white hover:bg-black/5"
                  }`}
                >
                  Multiple Items
                </button>
              </div>
              <p className="text-xs text-foreground-muted leading-relaxed border-l-2 border-foreground pl-3">
                {uploadMode === "bulk"
                  ? `Each photo becomes its own item on the Wall (max ${BULK_PHOTO_LIMIT}). Need 2 angles of the same piece? Select that Item chip, then tap the extra photo to merge it.`
                  : `Up to ${SINGLE_PHOTO_LIMIT} photos of the same piece (front, back, tag).`}
              </p>

              {photoItems.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-6 border-2 border-dashed border-foreground/30 p-8 bg-surface-muted">
                  <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md">
                    <Button
                      type="button"
                      variant="cta"
                      onClick={openCamera}
                      size="lg"
                      disabled={compressingPhotos}
                      className="h-16 w-full gap-3 font-bold"
                    >
                      <Camera className="w-6 h-6 shrink-0" />
                      Take a photo
                    </Button>
                  </div>
                  <p className="text-sm font-bold text-foreground-muted uppercase tracking-widest">or</p>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={openGallery}
                    disabled={compressingPhotos}
                    className="w-full max-w-md shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] font-bold"
                  >
                    <ImagePlus className="w-4 h-4 mr-2" /> Upload from gallery
                  </Button>
                  {compressingPhotos && (
                    <p className="text-sm font-bold flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> Adding photo…
                    </p>
                  )}
                  {photoPickError && (
                    <p className="text-xs font-bold text-accent-red text-center max-w-md">{photoPickError}</p>
                  )}
                </div>
              ) : (
                <div className="flex-1 flex flex-col gap-4">
                  {uploadMode === "bulk" && (
                    <div className="flex flex-col gap-2">
                      <p className="text-xs font-bold uppercase tracking-widest text-foreground">
                        {uniqueGroupCount}/{BULK_PHOTO_LIMIT} items · {photoItems.length}/{BULK_PHOTO_LIMIT} photos
                        {uniqueGroupCount >= BULK_PHOTO_LIMIT
                          ? " · limit reached"
                          : " · each photo = one item (tap to merge)"}
                      </p>
                      {uniqueGroupCount >= BULK_PHOTO_LIMIT && (
                        <p className="text-xs font-bold border-2 border-foreground bg-accent-pink/20 px-3 py-2">
                          Limit {BULK_PHOTO_LIMIT}/{BULK_PHOTO_LIMIT} items — remove one to add another. This is not a bug.
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {itemSlots.map((gid) => {
                          const n = itemLabel(gid)
                          const count = countInGroup(gid)
                          const selected = gid === activeGroupId
                          return (
                            <button
                              key={gid}
                              type="button"
                              disabled={analyzing}
                              onClick={() => setActiveGroupId(gid)}
                              className={`h-10 min-w-[4.5rem] px-3 border-2 border-foreground text-xs font-black uppercase tracking-widest disabled:opacity-50 ${
                                selected ? "bg-accent-pink" : "bg-white hover:bg-black/5"
                              }`}
                            >
                              Item {n}
                              {count > 0 ? ` (${count})` : ""}
                            </button>
                          )
                        })}
                        {photoItems.length < photoLimit && !analyzing && (
                          <button
                            type="button"
                            onClick={startNewItemGroup}
                            className="h-10 px-3 border-2 border-dashed border-foreground text-xs font-black uppercase tracking-widest bg-white hover:bg-black/5"
                            aria-label="Add another item"
                          >
                            + Item
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                  {uploadMode === "single" && photoItems.length > 0 && (
                    <p className="text-xs font-bold uppercase tracking-widest text-foreground">
                      {photoItems.length}/{SINGLE_PHOTO_LIMIT} photos for this item
                      {photoItems.length >= SINGLE_PHOTO_LIMIT ? " · limit reached" : ""}
                    </p>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {photoItems.map((p, index) => {
                      const itemNum = itemLabel(p.groupId)
                      const photosInGroup = photoItems.filter((x) => x.groupId === p.groupId)
                      const photoNum = photosInGroup.indexOf(p) + 1
                      const inActive = uploadMode === "bulk" && p.groupId === activeGroupId
                      return (
                      <div
                        key={index}
                        role={uploadMode === "bulk" ? "button" : undefined}
                        tabIndex={uploadMode === "bulk" ? 0 : undefined}
                        onClick={() => assignPhotoToActiveItem(index)}
                        onKeyDown={(e) => {
                          if (uploadMode !== "bulk") return
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault()
                            assignPhotoToActiveItem(index)
                          }
                        }}
                        className={`relative aspect-square border-2 bg-surface-muted ${
                          inActive ? "border-accent-pink ring-2 ring-accent-pink/40" : "border-foreground"
                        } ${uploadMode === "bulk" ? "cursor-pointer" : ""}`}
                      >
                        <img src={p.previewUrl} alt={`Upload ${index + 1}`} className="w-full h-full object-cover pointer-events-none" />
                        {uploadMode === "bulk" ? (
                          <span className="absolute top-2 left-2 bg-white border-2 border-foreground px-1.5 py-0.5 text-[10px] font-black uppercase tracking-widest pointer-events-none">
                            Item {itemNum} · Pic {photoNum}
                          </span>
                        ) : (
                          <span className="absolute top-2 left-2 bg-white border-2 border-foreground px-1.5 py-0.5 text-[10px] font-black uppercase tracking-widest">
                            Photo {photoNum}
                          </span>
                        )}
                        {p.status === "done" && (
                          <span className="absolute bottom-2 left-2 flex items-center gap-1 bg-accent-green border-2 border-foreground px-1.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-foreground shadow-[1px_1px_0px_rgba(0,0,0,1)] pointer-events-none">
                            <Sparkles className="w-3 h-3" /> AI enhanced
                          </span>
                        )}
                        {analyzing && p.status === "pending" && (
                          <div className="absolute inset-0 bg-white/70 flex items-center justify-center pointer-events-none">
                            <Loader2 className="w-6 h-6 animate-spin text-foreground" />
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            removePhoto(index)
                          }}
                          className="absolute top-2 right-2 p-1 bg-white border-2 border-foreground shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all z-10"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )})}

                    {photoItems.length < photoLimit && (
                      <div className="aspect-square border-2 border-dashed border-foreground/30 bg-surface-muted flex flex-col items-center justify-center gap-2 p-2">
                        <button
                          type="button"
                          onClick={openCamera}
                          disabled={compressingPhotos}
                          className="w-full py-2 text-[10px] font-black uppercase tracking-wider border-2 border-foreground bg-white hover:bg-black/5 disabled:opacity-50"
                        >
                          Camera
                        </button>
                        <button
                          type="button"
                          onClick={openGallery}
                          disabled={compressingPhotos}
                          className="w-full py-2 text-[10px] font-black uppercase tracking-wider border-2 border-foreground bg-white hover:bg-black/5 disabled:opacity-50"
                        >
                          Gallery
                        </button>
                      </div>
                    )}
                  </div>
                  {compressingPhotos && (
                    <p className="text-sm font-bold flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> Adding photo…
                    </p>
                  )}
                  {photoPickError && (
                    <p className="text-xs font-bold text-accent-red">{photoPickError}</p>
                  )}
                  <p className="text-xs text-foreground-muted mt-2 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" /> Our AI pre-fills details from your photos — you’ll confirm everything on the next step.
                  </p>
                  {analyzing && (
                    <div className="mt-3 flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                      <p className="text-xs font-bold flex items-center gap-2 grow">
                        <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                        AI reading photos… You can skip title autofill — studio cutouts keep running.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={skipAutoFill}
                        className="font-bold uppercase tracking-wide sm:tracking-widest shrink-0 border-2 border-foreground"
                        data-testid="skip-autofill"
                      >
                        Skip title autofill → fill myself
                      </Button>
                    </div>
                  )}
                  {analyzeError && (
                    <p className="mt-2 text-xs font-bold border-2 border-foreground bg-accent-pink/15 px-3 py-2" data-testid="analyze-error">
                      {analyzeError}
                    </p>
                  )}
                  {sensitivePhotoWarning && (
                    <p className="mt-2 text-xs font-bold border-2 border-foreground bg-accent-pink/20 px-3 py-2" data-testid="sensitive-photo-warning">
                      {sensitivePhotoWarning}
                    </p>
                  )}
                  {bgKeptNote && (
                    <p className="mt-2 text-xs text-foreground-muted" data-testid="bg-kept-note">
                      {bgKeptNote}
                    </p>
                  )}
                </div>
              )}

              {/* Separate inputs: capture forces camera on mobile; gallery must omit it. */}
              <input
                type="file"
                ref={cameraInputRef}
                className="sr-only"
                accept="image/*"
                capture="environment"
                onChange={handlePhotoUpload}
              />
              <input
                type="file"
                ref={galleryInputRef}
                className="sr-only"
                accept="image/*,.heic,.heif"
                multiple
                onChange={handlePhotoUpload}
              />
            </motion.div>
          )}

          {step === 2 && (
             <motion.div
               key="step2"
               initial={{ opacity: 0, x: 20 }}
               animate={{ opacity: 1, x: 0 }}
               exit={{ opacity: 0, x: -20 }}
               className="flex flex-col gap-6 flex-1"
             >
               <div>
                 <h2 className="text-3xl font-display font-bold uppercase mb-2">Item Details</h2>
                 <p className="text-foreground-muted">
                   {isMultiItem
                     ? `You’re posting ${uniqueGroupCount} items. Switch tabs below to review AI details for each.`
                     : "Tell us about what you are passing on."}
                 </p>
               </div>

               {aiApplied && (
                 <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest bg-accent-green/15 text-foreground border-2 border-foreground px-3 py-2">
                   <Sparkles className="w-4 h-4" /> Pre-filled from your photo by AI - please review and edit.
                 </div>
               )}

               {isMultiItem && groupsMissingAiTitle().length > 0 && (
                 <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center border-2 border-foreground bg-accent-pink/15 px-3 py-2">
                   <p className="text-xs font-bold grow">
                     {groupsMissingAiTitle().length} item{groupsMissingAiTitle().length === 1 ? "" : "s"} still need AI
                     (tabs still say “Item #”). Run AI on those, or type titles yourself.
                   </p>
                   <Button
                     type="button"
                     variant="outline"
                     disabled={analyzing}
                     onClick={retryAiForRemaining}
                     className="font-bold uppercase tracking-wide text-xs shrink-0 border-2 border-foreground"
                     data-testid="retry-ai-remaining"
                   >
                     {analyzing ? (
                       <span className="flex items-center gap-2">
                         <Loader2 className="w-3.5 h-3.5 animate-spin" /> AI working…
                       </span>
                     ) : (
                       "Run AI on remaining"
                     )}
                   </Button>
                 </div>
               )}

               {isMultiItem && (
                 <div className="flex flex-col gap-2">
                   <div className="flex flex-wrap gap-2">
                   {uniqueGroups.map((gid) => {
                     const n = itemLabel(gid)
                     const selected = gid === detailGroup
                     const thumb = photoItems.find((p) => p.groupId === gid)
                     const title =
                       itemDrafts[gid]?.itemTitle ||
                       thumb?.suggestion?.title ||
                       `Item ${n}`
                     const incomplete = draftIncompleteReasons(resolveGroupDraft(gid)).length > 0
                     return (
                       <button
                         key={gid}
                         type="button"
                         onClick={() => selectDetailGroup(gid)}
                         className={`flex items-center gap-2 h-12 pl-1 pr-3 border-2 text-xs font-black uppercase tracking-widest ${
                           selected
                             ? "bg-accent-pink border-foreground"
                             : incomplete
                               ? "bg-accent-pink/20 border-accent-red"
                               : "bg-white border-foreground hover:bg-black/5"
                         }`}
                         title={incomplete ? "Needs size or other required fields" : undefined}
                       >
                         {thumb && (
                           <img
                             src={thumb.previewUrl}
                             alt=""
                             className="h-9 w-9 object-cover border border-foreground"
                           />
                         )}
                         Item {n}
                         {incomplete && (
                           <span className="text-accent-red normal-case tracking-normal font-bold" aria-hidden>
                             !
                           </span>
                         )}
                         <span className="hidden sm:inline font-sans font-medium normal-case tracking-normal text-foreground-muted max-w-[8rem] truncate">
                           {title}
                         </span>
                       </button>
                     )
                   })}
                   </div>
                   {incompleteMultiGroups().length > 0 && (
                     <p className="text-xs font-bold border-2 border-foreground bg-accent-pink/15 px-3 py-2" data-testid="multi-incomplete-hint">
                       {(() => {
                         const incomplete = incompleteMultiGroups()
                         const needTitle = incomplete.filter((x) => x.reasons.includes("title"))
                         const needSize = incomplete.filter((x) => x.reasons.includes("size") || x.reasons.includes("age"))
                         const parts: string[] = []
                         if (needTitle.length) {
                           parts.push(
                             `Items ${needTitle.map((x) => x.label).join(", ")} still need a TITLE (AI didn’t fill those — type one or tap “Run AI on remaining”)`,
                           )
                         }
                         if (needSize.length) {
                           parts.push(
                             `Items ${needSize.map((x) => x.label).join(", ")} still need a SIZE`,
                           )
                         }
                         return parts.join(". ") + "."
                       })()}
                     </p>
                   )}
                   {multiIncompleteNote && (
                     <p className="text-xs font-bold border-2 border-accent-red bg-accent-pink/20 px-3 py-2" data-testid="multi-continue-block">
                       {multiIncompleteNote}
                     </p>
                   )}
                 </div>
               )}

               <div className="flex flex-col gap-4">
                 <div className="flex flex-col gap-1.5">
                   <label className="text-sm font-bold uppercase tracking-widest text-foreground">Item Title *</label>
                   <Input
                     value={isMultiItem ? activeDraft.itemTitle : formData.itemTitle}
                     onChange={(e) =>
                       isMultiItem
                         ? patchActiveDraft({ itemTitle: e.target.value })
                         : setFormData({ ...formData, itemTitle: e.target.value })
                     }
                     placeholder="e.g. Vintage Denim Jacket"
                     className="rounded-none border-2 border-foreground"
                   />
                 </div>
                 
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <div className="flex flex-col gap-1.5">
                     <label className="text-sm font-bold uppercase tracking-widest text-foreground">Category *</label>
                     <select 
                        value={
                          (() => {
                            const cat = isMultiItem ? activeDraft.category : formData.category
                            return DROP_CATEGORY_OPTIONS.some((o) => o.value === cat)
                              ? cat
                              : cat === "Kicks"
                                ? "Kicks"
                                : cat === "Bags"
                                  ? "Bags"
                                  : "Tops"
                          })()
                        } 
                        onChange={(e) =>
                          isMultiItem
                            ? patchActiveDraft({ category: e.target.value })
                            : setFormData({ ...formData, category: e.target.value })
                        }
                        className="flex h-10 w-full bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 rounded-none border-2 border-foreground"
                      >
                       {DROP_CATEGORY_OPTIONS.map(({ label, value }) => (
                         <option key={value} value={value}>{label}</option>
                       ))}
                     </select>
                   </div>

                   <div className="flex flex-col gap-1.5">
                     <label className="text-sm font-bold uppercase tracking-widest text-foreground">For *</label>
                     <select
                        value={isMultiItem ? activeDraft.gender : formData.gender}
                        onChange={(e) =>
                          isMultiItem
                            ? patchActiveDraft({ gender: e.target.value, size: "", age: "" })
                            : setFormData({ ...formData, gender: e.target.value, size: "", age: "" })
                        }
                        className="flex h-10 w-full bg-background px-3 py-2 text-sm rounded-none border-2 border-foreground"
                      >
                       {DROP_GENDER_OPTIONS.map(({ label, value }) => (
                         <option key={value} value={value}>{label}</option>
                       ))}
                     </select>
                   </div>
                 </div>

                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <div className="flex flex-col gap-1.5">
                     <label className="text-sm font-bold uppercase tracking-widest text-foreground">Condition *</label>
                     <select 
                        value={isMultiItem ? activeDraft.condition : formData.condition} 
                        onChange={(e) =>
                          isMultiItem
                            ? patchActiveDraft({ condition: e.target.value })
                            : setFormData({ ...formData, condition: e.target.value })
                        }
                        className="flex h-10 w-full bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 rounded-none border-2 border-foreground"
                      >
                       <option value="Excellent">Excellent</option>
                       <option value="Good">Good</option>
                       <option value="Fair but fully usable">Fair but fully usable</option>
                     </select>
                   </div>

                   <div className="flex flex-col gap-1.5">
                     <label className="text-sm font-bold uppercase tracking-widest text-foreground">
                       {(isMultiItem ? activeDraft.gender : formData.gender) === "girls" ||
                       (isMultiItem ? activeDraft.gender : formData.gender) === "boys"
                         ? "Age band *"
                         : sizeRequiredForDraft(
                             isMultiItem ? activeDraft.category : formData.category,
                             isMultiItem ? activeDraft.gender : formData.gender,
                           )
                           ? "Size *"
                           : "Size"}
                     </label>
                     {(isMultiItem ? activeDraft.gender : formData.gender) === "girls" ||
                     (isMultiItem ? activeDraft.gender : formData.gender) === "boys" ? (
                       <select
                         value={isMultiItem ? activeDraft.age : formData.age}
                         onChange={(e) =>
                           isMultiItem
                             ? patchActiveDraft({ age: e.target.value, size: e.target.value })
                             : setFormData({ ...formData, age: e.target.value, size: e.target.value })
                         }
                         className="flex h-10 w-full bg-background px-3 py-2 text-sm rounded-none border-2 border-foreground"
                         required
                       >
                         <option value="">Select age band</option>
                         {KIDS_AGE_BANDS.map(s => (
                           <option key={s} value={s}>{s}</option>
                         ))}
                       </select>
                     ) : sizeRequiredForDraft(
                         isMultiItem ? activeDraft.category : formData.category,
                         isMultiItem ? activeDraft.gender : formData.gender,
                       ) ? (
                       <select
                         value={isMultiItem ? activeDraft.size : formData.size}
                         onChange={(e) =>
                           isMultiItem
                             ? patchActiveDraft({ size: e.target.value })
                             : setFormData({ ...formData, size: e.target.value })
                         }
                         className="flex h-10 w-full bg-background px-3 py-2 text-sm rounded-none border-2 border-foreground"
                         required
                       >
                         <option value="">Select size</option>
                         {APPAREL_SIZES.map(s => (
                           <option key={s} value={s}>{s}</option>
                         ))}
                       </select>
                     ) : (
                       <Input
                         value={isMultiItem ? activeDraft.size : formData.size}
                         onChange={(e) =>
                           isMultiItem
                             ? patchActiveDraft({ size: e.target.value })
                             : setFormData({ ...formData, size: e.target.value })
                         }
                         placeholder="Optional"
                         className="rounded-none border-2 border-foreground"
                       />
                     )}
                   </div>
                 </div>

                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <div className="flex flex-col gap-1.5">
                     <label className="text-sm font-bold uppercase tracking-widest text-foreground">Brand</label>
                     <Input
                       value={isMultiItem ? activeDraft.brand : formData.brand}
                       onChange={(e) =>
                         isMultiItem
                           ? patchActiveDraft({ brand: e.target.value })
                           : setFormData({ ...formData, brand: e.target.value })
                       }
                       placeholder="Optional"
                       className="rounded-none border-2 border-foreground"
                     />
                   </div>
                   <div className="flex flex-col gap-1.5">
                     <label className="text-sm font-bold uppercase tracking-widest text-foreground">Quantity *</label>
                     <Input
                       type="number"
                       min="1"
                       value={isMultiItem ? activeDraft.quantity : formData.quantity}
                       onChange={(e) => {
                         const q = parseInt(e.target.value) || 1
                         isMultiItem
                           ? patchActiveDraft({ quantity: q })
                           : setFormData({ ...formData, quantity: q })
                       }}
                       className="rounded-none border-2 border-foreground"
                     />
                   </div>
                 </div>

                 <div className="flex flex-col gap-1.5">
                   <label className="text-sm font-bold uppercase tracking-widest text-foreground">Description</label>
                   <Textarea
                     value={isMultiItem ? activeDraft.description : formData.description}
                     onChange={(e) =>
                       isMultiItem
                         ? patchActiveDraft({ description: e.target.value })
                         : setFormData({ ...formData, description: e.target.value })
                     }
                     placeholder="Optional — why are you dropping it? What should someone know?"
                     className="rounded-none border-2 border-foreground h-24"
                   />
                 </div>
                 
                 <div className="flex flex-col gap-1.5">
                   <label className="text-sm font-bold uppercase tracking-widest text-foreground">Any defects? (Optional)</label>
                   <Input
                     value={isMultiItem ? activeDraft.defect : formData.defect}
                     onChange={(e) =>
                       isMultiItem
                         ? patchActiveDraft({ defect: e.target.value })
                         : setFormData({ ...formData, defect: e.target.value })
                     }
                     placeholder="e.g. Missing a button, minor scratch - leave blank if none"
                     className="rounded-none border-2 border-foreground"
                   />
                 </div>
               </div>
             </motion.div>
          )}

          {step === 3 && (
             <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col gap-6 flex-1">
               <div>
                 <h2 className="text-3xl font-display font-bold uppercase mb-2">Donor Details</h2>
                 <p className="text-foreground-muted">How we can contact you regarding this drop.</p>
               </div>
               
               <div className="flex flex-col gap-4">
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <div className="flex flex-col gap-1.5">
                     <label className="text-sm font-bold uppercase tracking-widest text-foreground">First Name *</label>
                     <Input value={formData.firstName} onChange={e => setFormData({...formData, firstName: e.target.value})} maxLength={80} className="rounded-none border-2 border-foreground" />
                   </div>
                   <div className="flex flex-col gap-1.5">
                     <label className="text-sm font-bold uppercase tracking-widest text-foreground">Last Name (Optional)</label>
                     <Input value={formData.lastName} onChange={e => setFormData({...formData, lastName: e.target.value})} maxLength={80} className="rounded-none border-2 border-foreground" />
                   </div>
                 </div>
                 
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <div className="flex flex-col gap-1.5">
                     <label className="text-sm font-bold uppercase tracking-widest text-foreground">Mobile Number *</label>
                     <Input type="tel" name="tel" autoComplete="tel-national" inputMode="numeric" maxLength={10} value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value.replace(/\D/g, "").slice(0, 10)})} className="rounded-none border-2 border-foreground" />
                     <p className="text-xs text-foreground-muted">10 digits, starting with 6-9.</p>
                   </div>
                   <div className="flex flex-col gap-1.5">
                     <label className="text-sm font-bold uppercase tracking-widest text-foreground">Email (Optional)</label>
                     <Input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="rounded-none border-2 border-foreground" />
                   </div>
                 </div>
                 
                 <div className="flex flex-col gap-3 mt-4 border-t-2 border-foreground/10 pt-4">
                   <label className="text-sm font-bold uppercase tracking-widest text-foreground mb-2">Wall of Love Recognition</label>
                   
                   <label className="flex items-center gap-3 p-3 border-2 border-foreground bg-surface-muted cursor-pointer hover:bg-black/5">
                     <input 
                        type="radio" 
                        name="recognition" 
                        value="name" 
                        checked={formData.recognitionPreference === 'name'} 
                        onChange={() => setFormData({...formData, recognitionPreference: 'name'})}
                        className="w-4 h-4 text-foreground focus:ring-foreground"
                      />
                     <span className="font-bold">Show my first name</span>
                   </label>

                   {profileUsername ? (
                     <label className="flex items-center gap-3 p-3 border-2 border-foreground bg-surface-muted cursor-pointer hover:bg-black/5">
                       <input
                          type="radio"
                          name="recognition"
                          value="alias"
                          checked={formData.recognitionPreference === 'alias'}
                          onChange={() => setFormData({...formData, recognitionPreference: 'alias', aliasName: profileUsername})}
                          className="w-4 h-4 text-foreground focus:ring-foreground"
                        />
                       <span className="font-bold">Show my username <span className="text-accent-pink">@{profileUsername}</span></span>
                     </label>
                   ) : null}

                   <label className="flex items-center gap-3 p-3 border-2 border-foreground bg-surface-muted cursor-pointer hover:bg-black/5">
                     <input
                        type="radio"
                        name="recognition"
                        value="anonymous"
                        checked={formData.recognitionPreference === 'anonymous'}
                        onChange={() => setFormData({...formData, recognitionPreference: 'anonymous'})}
                        className="w-4 h-4 text-foreground focus:ring-foreground"
                      />
                     <span className="font-bold">Keep me anonymous</span>
                   </label>
                 </div>
               </div>
             </motion.div>
          )}

          {step === 4 && (
             <motion.div key="step4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col gap-6 flex-1">
               <div>
                 <h2 className="text-3xl font-display font-bold uppercase mb-2">How should this reach them?</h2>
                 <p className="text-foreground-muted">Choose how you would like to hand over this item.</p>
               </div>

               <PrivacyBuildingNotice
                 extraNote={
                   <>
                     Your item goes live on the Wall of Kindness as soon as you submit.
                   </>
                 }
               />

               <div className="flex flex-col gap-1.5">
                 <label className="text-sm font-bold uppercase tracking-widest text-foreground">Handover option *</label>
                 <select
                   value={
                     formData.giverLogistics === "personal_driver"
                       ? "giver_sends"
                       : formData.giverLogistics
                   }
                   onChange={e => {
                     const giverLogistics = e.target.value as GiverLogistics
                     setFormData({
                       ...formData,
                       giverLogistics,
                       // Launch policy: receiver pays courier once. Reloved takes no cut.
                       porterPaidBy: giverLogistics === "porter_arranged" ? "receiver" : "",
                     })
                   }}
                   className="flex h-12 w-full bg-background px-3 py-2 text-sm rounded-none border-2 border-foreground font-bold"
                 >
                   {GIVER_LOGISTICS_PICK_OPTIONS.map((value) => (
                     <option key={value} value={value}>{GIVER_LOGISTICS_LABELS[value]}</option>
                   ))}
                 </select>
               </div>

               {formData.giverLogistics === "receiver_collects" && (
                 <div className="flex flex-col gap-4">
                   {hasSavedAddress && !editingAddress && (
                     <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs font-bold uppercase tracking-widest bg-accent-green/15 text-foreground border-2 border-foreground px-3 py-2">
                       <span className="flex items-start sm:items-center gap-2 min-w-0"><UserCheck className="w-4 h-4 shrink-0 mt-0.5 sm:mt-0" /> <span className="min-w-0">Using the address from your account.</span></span>
                       <button type="button" onClick={() => setEditingAddress(true)} className="underline shrink-0 self-start sm:self-auto">Edit</button>
                     </div>
                   )}

                   {hasSavedAddress && !editingAddress ? (
                     <div className="flex flex-col gap-1.5">
                       <label className="text-sm font-bold uppercase tracking-widest text-foreground">Building / landmark</label>
                       <div className="border-2 border-foreground bg-surface-muted px-4 py-3">
                         <p className="font-bold">{formData.pickupLocality}</p>
                         {formData.pincode && <p className="text-xs text-foreground-muted mt-1">Pincode: {formData.pincode}</p>}
                       </div>
                       {privacyAddressWarning(formData.pickupLocality) && (
                         <p className="text-xs font-bold text-accent-red">{privacyAddressWarning(formData.pickupLocality)}</p>
                       )}
                     </div>
                   ) : (
                     <>
                       <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                         <div className="flex flex-col gap-1.5">
                           <label className="text-sm font-bold uppercase tracking-widest text-foreground">City *</label>
                           <select
                              value={formData.city}
                              disabled
                              className="flex h-10 w-full bg-surface-muted px-3 py-2 text-sm rounded-none border-2 border-foreground text-foreground-muted cursor-not-allowed"
                            >
                             <option value="Mumbai">Mumbai</option>
                           </select>
                         </div>
                         <div className="flex flex-col gap-1.5">
                           <label className="text-sm font-bold uppercase tracking-widest text-foreground">Pincode</label>
                           <Input
                             value={formData.pincode}
                             maxLength={6}
                             inputMode="numeric"
                             onChange={e => {
                               const pincode = e.target.value.replace(/\D/g, "").slice(0, 6)
                               const matches = lookupLocalities(pincode)
                               setFormData(prev => ({
                                 ...prev,
                                 pincode,
                                 pickupLocality: matches.length === 1 ? `${matches[0]}, Mumbai` : prev.pickupLocality,
                               }))
                             }}
                             placeholder="e.g. 400050"
                             className="rounded-none border-2 border-foreground"
                           />
                         </div>
                       </div>

                       <div className="flex flex-col gap-1.5">
                         <label className="text-sm font-bold uppercase tracking-widest text-foreground">Building / landmark *</label>
                         {(() => {
                           const matches = lookupLocalities(formData.pincode)
                           if (matches.length > 1) {
                             return (
                               <select
                                  value={formData.pickupLocality}
                                  onChange={e => setFormData({...formData, pickupLocality: e.target.value})}
                                  className="flex h-10 w-full bg-background px-3 py-2 text-sm rounded-none border-2 border-foreground"
                                >
                                 <option value="">Select locality / area</option>
                                 {matches.map(m => (
                                   <option key={m} value={`${m}, Mumbai`}>{m}</option>
                                 ))}
                               </select>
                             )
                           }
                           return (
                             <AddressAutocomplete
                               value={formData.pickupLocality}
                               onChange={val => setFormData({...formData, pickupLocality: val})}
                               placeholder="Search building or landmark"
                               className="rounded-none border-2 border-foreground"
                             />
                           )
                         })()}
                         {privacyAddressWarning(formData.pickupLocality) && (
                           <p className="text-xs font-bold text-accent-red">{privacyAddressWarning(formData.pickupLocality)}</p>
                         )}
                         <p className="text-xs text-foreground-muted">Building or landmark only — no flat or wing. {formData.pincode && lookupLocalities(formData.pincode).length === 0 ? "Pincode not recognised - search the landmark manually." : ""}</p>
                       </div>
                     </>
                   )}

                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                     <div className="flex flex-col gap-1.5">
                       <label className="text-sm font-bold uppercase tracking-widest text-foreground">Preferred Date Range *</label>
                       <div className="grid grid-cols-2 gap-2">
                         {DATE_RANGE_PRESETS.map(preset => (
                           <button
                             key={preset}
                             type="button"
                             onClick={() => setFormData({...formData, dateRange: preset})}
                             className={`h-10 px-2 border-2 border-foreground text-xs font-black uppercase tracking-widest transition-colors ${
                               formData.dateRange === preset ? "bg-accent-pink" : "bg-white hover:bg-black/5"
                             }`}
                           >
                             {preset}
                           </button>
                         ))}
                       </div>
                       <Input value={formData.dateRange} onChange={e => setFormData({...formData, dateRange: e.target.value})} placeholder="Or type your own" className="rounded-none border-2 border-foreground" />
                     </div>
                     <div className="flex flex-col gap-1.5">
                       <label className="text-sm font-bold uppercase tracking-widest text-foreground">Preferred Time Window *</label>
                       <div className="grid grid-cols-2 gap-2">
                         {TIME_WINDOW_PRESETS.map(preset => (
                           <button
                             key={preset}
                             type="button"
                             onClick={() => setFormData({...formData, timeWindow: preset})}
                             className={`h-10 px-2 border-2 border-foreground text-xs font-black uppercase tracking-widest transition-colors ${
                               formData.timeWindow === preset ? "bg-accent-pink" : "bg-white hover:bg-black/5"
                             }`}
                           >
                             {preset}
                           </button>
                         ))}
                       </div>
                       <Input value={formData.timeWindow} onChange={e => setFormData({...formData, timeWindow: e.target.value})} placeholder="Or type your own" className="rounded-none border-2 border-foreground" />
                     </div>
                   </div>
                 </div>
               )}

               {formData.giverLogistics === "giver_sends" && (
                 <div className="flex flex-col gap-4">
                   <p className="text-xs text-foreground-muted leading-relaxed border-l-2 border-foreground pl-3">
                     You send it however you wish (yourself, a driver, or any courier you arrange). Receivers are matched within <span className="font-bold text-foreground">3 km</span> of your building. They share a delivery address only after you accept.
                   </p>
                   {hasSavedAddress && !editingAddress ? (
                     <div className="flex flex-col gap-1.5">
                       <label className="text-sm font-bold uppercase tracking-widest text-foreground">Your building / landmark *</label>
                       <div className="border-2 border-foreground bg-surface-muted px-4 py-3">
                         <p className="font-bold">{formData.pickupLocality}</p>
                       </div>
                       <button type="button" onClick={() => setEditingAddress(true)} className="text-xs font-black uppercase tracking-widest underline w-fit">
                         Edit
                       </button>
                     </div>
                   ) : (
                     <div className="flex flex-col gap-1.5">
                       <label className="text-sm font-bold uppercase tracking-widest text-foreground">Your building / landmark *</label>
                       <AddressAutocomplete
                         value={formData.pickupLocality}
                         onChange={(val) => setFormData({ ...formData, pickupLocality: val })}
                         onSelect={(val, coords) =>
                           setFormData({
                             ...formData,
                             pickupLocality: val,
                             latitude: coords?.lat ?? formData.latitude,
                             longitude: coords?.lng ?? formData.longitude,
                           })
                         }
                         placeholder="Search your building or landmark — used for 3 km matching"
                         className="rounded-none border-2 border-foreground"
                       />
                       {privacyAddressWarning(formData.pickupLocality) && (
                         <p className="text-xs font-bold text-accent-red">{privacyAddressWarning(formData.pickupLocality)}</p>
                       )}
                     </div>
                   )}
                 </div>
               )}

               {formData.giverLogistics === "porter_arranged" && (
                 <div className="flex flex-col gap-4">
                   <p className="text-xs text-foreground-muted leading-relaxed border-l-2 border-foreground pl-3">
                     Reloved matches you, then books a courier gate to gate after you both agree timing. Rider picks up at
                     your building gate only (ops phone — your number stays private). Your item stays ₹0 free.
                   </p>
                   <div className="flex flex-col gap-1.5">
                     <label className="text-sm font-bold uppercase tracking-widest text-foreground">Pickup building / landmark *</label>
                     <AddressAutocomplete
                       value={formData.pickupLocality}
                       onChange={val => setFormData({ ...formData, pickupLocality: val, porterPaidBy: "receiver" })}
                       onSelect={(val, _coords, postcode) => {
                         setFormData((prev) => ({
                           ...prev,
                           pickupLocality: withIndiaPincode(val, postcode || prev.pincode),
                           pincode: extractIndiaPincode(postcode || "") || prev.pincode,
                           porterPaidBy: "receiver",
                         }))
                       }}
                       placeholder="Search building or landmark — include pincode"
                       className="rounded-none border-2 border-foreground bg-white"
                     />
                     {!extractIndiaPincode(formData.pickupLocality) && !extractIndiaPincode(formData.pincode) && (
                       <p className="text-xs font-bold text-accent-red">
                         Add a 6-digit pincode (e.g. 400051) — courier booking needs it.
                       </p>
                     )}
                     {privacyAddressWarning(formData.pickupLocality) && (
                       <p className="text-xs font-bold text-accent-red">{privacyAddressWarning(formData.pickupLocality)}</p>
                     )}
                   </div>
                 </div>
               )}

               <div className="flex flex-col gap-1.5">
                 <label className="text-sm font-bold uppercase tracking-widest text-foreground">Coordination Notes</label>
                 <Textarea value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} placeholder="Any specific instructions for the handover partner?" className="rounded-none border-2 border-foreground h-24" />
               </div>
             </motion.div>
          )}

          {step === 5 && (
             <motion.div key="step5" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col gap-6 flex-1">
               <div>
                 <h2 className="text-3xl font-display font-bold uppercase mb-2">Recognition &amp; privacy</h2>
                 <p className="text-foreground-muted">How you appear on the Wall of Love, and how we keep your address private.</p>
               </div>

               <div className="flex-1 overflow-y-auto pr-2 flex flex-col gap-6">
                 <div className="bg-surface-muted border-2 border-foreground p-4 flex flex-col gap-3">
                   <h3 className="font-bold uppercase tracking-widest text-sm">Wall of Love Recognition</h3>
                   <label className="flex items-center gap-3 p-3 border-2 border-foreground bg-white cursor-pointer hover:bg-black/5">
                     <input
                       type="radio"
                       name="recognition-final"
                       checked={formData.recognitionPreference === "name"}
                       onChange={() => setFormData({ ...formData, recognitionPreference: "name" })}
                       className="w-4 h-4"
                     />
                     <span className="font-bold text-sm">Show my first name</span>
                   </label>
                   {profileUsername && (
                     <label className="flex items-center gap-3 p-3 border-2 border-foreground bg-white cursor-pointer hover:bg-black/5">
                       <input
                         type="radio"
                         name="recognition-final"
                         checked={formData.recognitionPreference === "alias"}
                         onChange={() => setFormData({ ...formData, recognitionPreference: "alias", aliasName: profileUsername })}
                         className="w-4 h-4"
                       />
                       <span className="font-bold text-sm">Show my username <span className="text-accent-pink">@{profileUsername}</span></span>
                     </label>
                   )}
                   <label className="flex items-center gap-3 p-3 border-2 border-foreground bg-white cursor-pointer hover:bg-black/5">
                     <input
                       type="radio"
                       name="recognition-final"
                       checked={formData.recognitionPreference === "anonymous"}
                       onChange={() => setFormData({ ...formData, recognitionPreference: "anonymous" })}
                       className="w-4 h-4"
                     />
                     <span className="font-bold text-sm">Keep me anonymous</span>
                   </label>
                 </div>

                 <PrivacyBuildingNotice className="mb-2" />
               </div>
             </motion.div>
          )}

          {step === 6 && (
             <motion.div key="step6" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col gap-6 flex-1">
               <div>
                 <h2 className="text-3xl font-display font-bold uppercase mb-2">Review your drop</h2>
                 <p className="text-foreground-muted">Check photos, item details, and handover — next step is Terms.</p>
               </div>
               
               <div className="flex-1 overflow-y-auto pr-2 flex flex-col gap-6">
                 
                 <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                   {photoItems.map((p, i) => (
                     <div key={i} className="relative">
                       <img src={p.previewUrl} alt="Upload preview" className="w-full aspect-square object-cover border-2 border-foreground bg-surface-muted" />
                       {isMultiItem && (
                         <span className="absolute top-1 left-1 bg-white border border-foreground px-1 text-[9px] font-black uppercase">
                           Item {itemLabel(p.groupId)}
                         </span>
                       )}
                       {!p.bgRemoved && (
                         <span className="absolute bottom-1 left-1 right-1 bg-black/80 text-white px-1 py-0.5 text-[9px] font-black uppercase text-center">
                           Processing image…
                         </span>
                       )}
                     </div>
                   ))}
                 </div>
                 {photoItems.some((p) => !p.bgRemoved) && (
                   <p className="text-xs font-bold flex items-center gap-2 border-2 border-foreground bg-accent-pink/15 px-3 py-2">
                     <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                     Studio cutouts still running — you can continue; submit won’t wait.
                   </p>
                 )}

                 {isMultiItem ? (
                   uniqueGroups.map((gid) => {
                     const d =
                       itemDrafts[gid] ||
                       draftFromSuggestion(photoItems.find((p) => p.groupId === gid)?.suggestion)
                     const n = itemLabel(gid)
                     return (
                       <div key={gid} className="bg-surface-muted border-2 border-foreground p-4">
                         <div className="flex justify-between items-center mb-4 border-b-2 border-foreground/10 pb-2">
                           <h3 className="font-bold uppercase tracking-widest">Item {n} details</h3>
                           <button
                             type="button"
                             onClick={() => {
                               setDetailGroupId(gid)
                               setStep(2)
                             }}
                             className="text-xs font-bold underline"
                           >
                             Edit
                           </button>
                         </div>
                         <div className="grid grid-cols-2 gap-y-4 text-sm">
                           <div>
                             <span className="text-foreground-muted font-bold block text-xs uppercase tracking-widest">Title</span>
                             {d.itemTitle || "-"}
                           </div>
                           <div>
                             <span className="text-foreground-muted font-bold block text-xs uppercase tracking-widest">Category</span>
                             {d.category === "Kicks" ? "Shoes" : d.category === "Bags" ? "Bags" : "Apparel"}
                           </div>
                           <div>
                             <span className="text-foreground-muted font-bold block text-xs uppercase tracking-widest">Condition</span>
                             {d.condition}
                           </div>
                           <div>
                             <span className="text-foreground-muted font-bold block text-xs uppercase tracking-widest">Quantity</span>
                             {d.quantity}
                           </div>
                         </div>
                       </div>
                     )
                   })
                 ) : (
                 <div className="bg-surface-muted border-2 border-foreground p-4">
                   <div className="flex justify-between items-center mb-4 border-b-2 border-foreground/10 pb-2">
                     <h3 className="font-bold uppercase tracking-widest">Item Details</h3>
                     <button type="button" onClick={() => setStep(2)} className="text-xs font-bold underline">Edit</button>
                   </div>
                   <div className="grid grid-cols-2 gap-y-4 text-sm">
                     <div>
                       <span className="text-foreground-muted font-bold block text-xs uppercase tracking-widest">Title</span>
                       {formData.itemTitle || "-"}
                     </div>
                     <div>
                       <span className="text-foreground-muted font-bold block text-xs uppercase tracking-widest">Category</span>
                       {formData.category === "Kicks" ? "Shoes" : formData.category === "Bags" ? "Bags" : "Apparel"}
                     </div>
                     <div>
                       <span className="text-foreground-muted font-bold block text-xs uppercase tracking-widest">Condition</span>
                       {formData.condition}
                     </div>
                     <div>
                       <span className="text-foreground-muted font-bold block text-xs uppercase tracking-widest">Quantity</span>
                       {formData.quantity}
                     </div>
                   </div>
                 </div>
                 )}

                 <div className="bg-surface-muted border-2 border-foreground p-4">
                   <div className="flex justify-between items-center mb-4 border-b-2 border-foreground/10 pb-2">
                     <h3 className="font-bold uppercase tracking-widest">Pickup &amp; delivery</h3>
                     <button
                       type="button"
                       onClick={() => setEditingAddress((v) => !v)}
                       className="text-xs font-bold underline"
                     >
                       {editingAddress ? "Done" : "Edit address"}
                     </button>
                   </div>
                   <div className="grid grid-cols-1 gap-y-4 text-sm">
                     <div>
                       <span className="text-foreground-muted font-bold block text-xs uppercase tracking-widest">How it moves</span>
                       After a claim, you and the claimer confirm addresses and pick a delivery time. Reloved books the courier.
                     </div>
                     <div>
                       <span className="text-foreground-muted font-bold block text-xs uppercase tracking-widest">Your pickup building</span>
                       {(() => {
                         const pickupLen = withIndiaPincode(formData.pickupLocality, formData.pincode).trim().length
                         const tooLong = pickupLen > PICKUP_LOCALITY_MAX
                         if (editingAddress || tooLong || !formData.pickupLocality.trim()) {
                           return (
                             <div className="mt-2 flex flex-col gap-2">
                               {tooLong && (
                                 <p className="text-xs font-bold text-accent-red border-2 border-accent-red bg-accent-red/10 px-3 py-2">
                                   Address is too long ({pickupLen}/{PICKUP_LOCALITY_MAX}). Shorten to building + area + pincode so you can continue.
                                 </p>
                               )}
                               <AddressAutocomplete
                                 value={formData.pickupLocality}
                                 onChange={(val) => {
                                   setEditingAddress(true)
                                   setFormData((prev) => ({
                                     ...prev,
                                     pickupLocality: val,
                                     pincode: extractIndiaPincode(val) || prev.pincode,
                                   }))
                                   setSubmitError(null)
                                 }}
                                 onSelect={(val, coords, postcode) => {
                                   setEditingAddress(true)
                                   setFormData((prev) => ({
                                     ...prev,
                                     pickupLocality: withIndiaPincode(val, postcode || prev.pincode),
                                     pincode: extractIndiaPincode(postcode || "") || prev.pincode,
                                     latitude: coords?.lat ?? prev.latitude,
                                     longitude: coords?.lng ?? prev.longitude,
                                   }))
                                   setSubmitError(null)
                                 }}
                                 placeholder="Building / landmark (keep under 500 characters)"
                                 className="rounded-none border-2 border-foreground"
                               />
                               <p
                                 className={`text-[10px] font-bold uppercase tracking-widest ${
                                   tooLong ? "text-accent-red" : "text-foreground-muted"
                                 }`}
                               >
                                 {pickupLen}/{PICKUP_LOCALITY_MAX} characters
                               </p>
                             </div>
                           )
                         }
                         return (
                           <p className="font-bold mt-1 break-words">
                             {formData.pickupLocality || "From your account address"}
                           </p>
                         )
                       })()}
                     </div>
                     <div>
                       <span className="text-foreground-muted font-bold block text-xs uppercase tracking-widest">Wall of Love</span>
                       {formData.recognitionPreference === "name"
                         ? `First name (${formData.firstName || "-"})`
                         : formData.recognitionPreference === "alias"
                           ? `@${(formData.aliasName || profileUsername || "").replace(/^@/, "")}`
                           : "Anonymous"}
                     </div>
                   </div>
                 </div>
               </div>
             </motion.div>
          )}

          {step === 8 && (
            <motion.div
              key="step8"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex flex-col gap-6 flex-1"
            >
              <div>
                <h2 className="text-3xl font-display font-bold uppercase mb-2">Sign in to post</h2>
                <p className="text-foreground-muted">
                  We save your photos and details on this device, then bring you back here after sign-in to finish.
                </p>
              </div>
              <div className="border-2 border-foreground bg-accent-pink/15 p-4 text-sm font-bold">
                After login: if photos look missing, stay on this page — we reconnect them automatically. Do not re-submit until the pink banner says photos are ready.
              </div>
              <div className="border-2 border-foreground bg-surface-muted p-4 text-sm flex flex-col gap-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">Ready to post</p>
                <p className="font-bold">{formData.itemTitle || "Your item"}</p>
                <p className="text-foreground-muted">
                  {photoItems.length} photo{photoItems.length === 1 ? "" : "s"} · {formData.category || "Apparel"}
                </p>
              </div>
              <p className="text-xs text-foreground-muted">
                New here? After the email code you only add <strong className="text-foreground">Name, Username, and Area</strong>.
              </p>
            </motion.div>
          )}

          {step === 7 && (
             <motion.div key="step7" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col gap-6 flex-1">
               <div>
                 <h2 className="text-3xl font-display font-bold uppercase mb-2">Terms &amp; submit</h2>
                 <p className="text-foreground-muted">Accept Terms, then submit your drop — it goes live on the Wall right away.</p>
               </div>

               <div className="flex-1 overflow-y-auto pr-2 flex flex-col gap-6">
                 <div className="bg-surface-muted border-2 border-foreground p-4 text-sm">
                   <p className="font-bold uppercase tracking-widest text-xs mb-2">Quick check</p>
                   <p className="text-foreground-muted">
                     {formData.itemTitle || "Untitled"} · {giverLogisticsLabel(formData.giverLogistics)} ·{" "}
                     {photoItems.length} photo{photoItems.length === 1 ? "" : "s"}
                   </p>
                   <button type="button" onClick={() => setStep(6)} className="mt-2 text-xs font-bold underline">
                     Back to full review
                   </button>
                 </div>

                 <LegalAccept
                   idPrefix="give"
                   className="mt-2"
                   showDeclaration
                   declaration={formData.declaration}
                   onDeclarationChange={(v) => setFormData({ ...formData, declaration: v })}
                   accepted={formData.acceptedTerms}
                   onAcceptedChange={(v) => setFormData({ ...formData, acceptedTerms: v })}
                 />
               </div>
             </motion.div>
          )}
        </AnimatePresence>

        {submitError && (
          <div className="mt-6 bg-accent-red/10 border-2 border-accent-red p-4 font-bold text-accent-red text-sm">
            {submitError}
          </div>
        )}

        <div className="mt-6 sm:mt-8 flow-actions pt-5 sm:pt-6 border-t border-foreground sm:border-t-2">
          <Button variant="ghost" onClick={handleBack} disabled={step === 1} className="font-bold uppercase tracking-wide sm:tracking-widest hover:bg-black/5 rounded-none w-full sm:w-auto shrink-0">
            Back
          </Button>
          
          {step === 7 ? (
            <div className="flex flex-col items-stretch sm:items-end gap-2 w-full sm:max-w-md sm:w-auto min-w-0">
              <Button variant="cta" onClick={handleSubmit} disabled={analyzing || !formData.declaration || !formData.acceptedTerms || isSubmitting || !( /^[6-9]\d{9}$/.test(formData.phone) || formData.email.trim().includes("@") || Boolean(getDonorToken()) )} className="font-bold uppercase tracking-wide sm:tracking-widest w-full">
                {analyzing ? 'Reconnecting photos…' : isSubmitting ? 'Submitting...' : 'I Accept - Submit'}
              </Button>
              <LegalReadMore className="text-left sm:text-right" />
            </div>
          ) : step === 1 && analyzing ? (
            <Button variant="cta" disabled className="font-bold uppercase tracking-wide sm:tracking-widest w-full sm:w-auto shrink-0">
              <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin shrink-0" /> AI reading photos…</span>
            </Button>
          ) : (
            <Button
              variant="cta"
              onClick={handleNext}
              disabled={
                step === 2
                  ? compressingPhotos
                  : !isStepValid(step) || analyzing || compressingPhotos
              }
              className="font-bold uppercase tracking-wide sm:tracking-widest w-full sm:w-auto shrink-0"
            >
              {step === 1 && compressingPhotos ? (
                <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin shrink-0" /> Preparing photos…</span>
              ) : step === 8 ? (
                "Sign in with email"
              ) : step === 2 && !loggedIn ? (
                "Continue to login"
              ) : (
                "Continue"
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

