import React, { useState, useRef, useEffect } from "react"
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
import {
  APPAREL_CATEGORIES,
  APPAREL_SIZES,
  DROP_CATEGORY_OPTIONS,
  normalizeItemGender,
  normalizeLaunchCategory,
  toStorageCategory,
  toStorageGender,
  GIVER_LOGISTICS_LABELS,
  type GiverLogistics,
} from "@shared/taxonomy"

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

interface ItemSuggestion {
  category: string
  title: string
  description: string
  condition: string
  brand: string | null
  gender: string
  sensitiveDetected?: boolean
  sensitiveReason?: string | null
}

const DATE_RANGE_PRESETS = ["24 hr", "48 hr", "1 week", "Flexible"]
const TIME_WINDOW_PRESETS = ["Mornings", "Afternoons", "Evenings", "Weekends only"]

export function Give() {
  const [step, setStep] = useState(1)
  const navigate = useNavigate()
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)

  const [photoItems, setPhotoItems] = useState<PhotoItem[]>([])
  const [uploadMode, setUploadMode] = useState<"single" | "bulk">("single")
  const [compressingPhotos, setCompressingPhotos] = useState(false)
  const [photoPickError, setPhotoPickError] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [aiApplied, setAiApplied] = useState(false)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)
  const [sensitivePhotoWarning, setSensitivePhotoWarning] = useState<string | null>(null)
  const [bgKeptNote, setBgKeptNote] = useState<string | null>(null)
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
    dateRange: "",
    timeWindow: "",
    notes: "",
    declaration: false,
    acceptedTerms: false,
    giverLogistics: "receiver_collects" as GiverLogistics,
    deliveryAddress: "",
    porterPaidBy: "" as "" | "receiver" | "giver",
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

  useEffect(() => {
    setLoggedIn(Boolean(getDonorToken()))
  }, [step])

  // Restore draft after login/onboarding (client: photo → details → auth → post).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(GIVE_DRAFT_KEY)
      if (!raw) return
      const draft = JSON.parse(raw) as {
        formData?: typeof formData
        photoItems?: Array<{ previewUrl: string; status: string; storagePath?: string; groupId: number; fileName?: string }>
        step?: number
        uploadMode?: "single" | "bulk"
      }
      if (draft.formData) setFormData((prev) => ({ ...prev, ...draft.formData }))
      if (draft.uploadMode) setUploadMode(draft.uploadMode)
      if (Array.isArray(draft.photoItems) && draft.photoItems.length) {
        setPhotoItems(
          draft.photoItems.map((p) => {
            const previewUrl = p.previewUrl || ""
            const fromStorage = p.storagePath ? resolveImageUrl(p.storagePath) : null
            const url =
              previewUrl.startsWith("data:") || previewUrl.startsWith("http")
                ? previewUrl
                : fromStorage || previewUrl
            return {
              file: new File([], p.fileName || "photo.jpg"),
              previewUrl: url,
              status: (p.status as PhotoItem["status"]) || "done",
              storagePath: p.storagePath,
              groupId: p.groupId ?? 0,
            }
          }),
        )
        setAiApplied(true)
      }
      // Resume after auth on handover step so they can finish and post.
      if (typeof draft.step === "number" && draft.step >= 1) {
        setStep(draft.step >= 2 ? 4 : draft.step)
      }
      sessionStorage.removeItem(GIVE_DRAFT_KEY)
    } catch {
      sessionStorage.removeItem(GIVE_DRAFT_KEY)
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

  async function persistGiveDraft(nextStep: number) {
    try {
      const photos = await Promise.all(
        photoItems.map(async (p) => ({
          previewUrl: p.storagePath
            ? resolveImageUrl(p.storagePath) || (await previewToPersistable(p.previewUrl))
            : await previewToPersistable(p.previewUrl),
          status: p.status,
          storagePath: p.storagePath,
          groupId: p.groupId,
          fileName: p.file?.name,
        })),
      )
      sessionStorage.setItem(
        GIVE_DRAFT_KEY,
        JSON.stringify({
          formData,
          uploadMode,
          step: nextStep,
          photoItems: photos,
        }),
      )
    } catch {
      /* ignore quota */
    }
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

  // Guest flow inserts Login (step 8) after item details: photo → details → login → post.
  const steps = !loggedIn
    ? [1, 2, 8, 4, 6, 7]
    : skipDonorDetails
      ? [1, 2, 4, 6, 7]
      : [1, 2, 3, 4, 6, 7]

  const STEP_LABELS: Record<number, string> = {
    1: "Photo",
    2: "Details",
    3: "You",
    4: "Handover",
    6: "Review",
    7: "Post",
    8: "Login",
  }

  // If skip flips on while user is on step 3 or 5, remount onto a valid step.
  useEffect(() => {
    if (skipDonorDetails && (step === 3 || step === 5)) setStep(4)
    if (loggedIn && step === 8) setStep(4)
  }, [skipDonorDetails, step, loggedIn])

  const handleBack = () => {
    setStep((s) => {
      const currentSteps = !loggedIn
        ? [1, 2, 8, 4, 6, 7]
        : skipDonorDetails
          ? [1, 2, 4, 6, 7]
          : [1, 2, 3, 4, 6, 7]
      const idx = currentSteps.indexOf(s)
      if (idx > 0) return currentSteps[idx - 1]
      if (s === 3 || s === 5 || s === 8) return 2
      return s
    })
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
      const room = Math.max(0, photoLimit - photoItems.length)
      const files = (await compressImageFiles(raw.slice(0, Math.max(room, 1)))).filter(
        (f) => f && f.size > 0,
      )
      if (files.length === 0) {
        setPhotoPickError("Couldn’t read that photo. Try gallery, or take another shot.")
        return
      }
      setPhotoItems((prev) => {
        const maxGroup = prev.reduce((m, p) => Math.max(m, p.groupId), -1)
        let nextGroup = uploadMode === "single" ? 0 : maxGroup
        return [
          ...prev,
          ...files.map((file) => {
            if (uploadMode === "bulk") nextGroup += 1
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
              groupId: uploadMode === "single" ? 0 : nextGroup,
            }
          }),
        ]
      })
      setAiApplied(false)
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
    setPhotoItems(prev => prev.filter((_, i) => i !== index))
    setAiApplied(false)
  }

  const photoLimit = uploadMode === "bulk" ? 12 : 5
  const uniqueGroupCount = new Set(photoItems.map(p => p.groupId)).size

  // Runs every photo through the same background-removal + Gemini
  // categorization pipeline as admin bulk-upload - swaps previews to the
  // white-bg processed version and pre-fills item details from the AI's
  // best guess. A photo that fails analysis just stays as the raw upload;
  // it never blocks the donor from continuing.
  const analyzePhotos = async () => {
    if (analyzing || aiApplied || photoItems.length === 0) return
    setAnalyzing(true)
    setAnalyzeError(null)
    setSensitivePhotoWarning(null)
    setBgKeptNote(null)
    try {
      const form = new FormData()
      // Stable names so we can match API results even if order drifts.
      photoItems.forEach((p, i) => {
        const ext = p.file.name.includes(".") ? p.file.name.split(".").pop() : "jpg"
        form.append("photos", p.file, `give-${i}.${ext || "jpg"}`)
      })

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
      const { results, firstSuggestion: apiFirst } = await api.postForm<{
        results: (AnalyzeOk | AnalyzeFail)[]
        firstSuggestion?: ItemSuggestion | null
      }>("/api/donations/analyze-photos", form)

      let anySensitive = false
      let anyBgKept = false
      setPhotoItems(prev =>
        prev.map((p, i) => {
          const byName = results.find((r) => {
            const name = r.originalName || r.filename || ""
            return name.startsWith(`give-${i}.`) || name === p.file.name
          })
          const r = byName || results[i]
          if (!r || !r.ok || !("suggestion" in r) || !r.suggestion) {
            // Keep local file pending so submit still uploads it.
            return { ...p, status: "pending" as const }
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
          // Suggestion only (no Storage URL) — keep pending so the original File uploads on submit.
          // Do not pretend the image was processed.
          return {
            ...p,
            status: "pending" as const,
            suggestion,
            bgRemoved: false,
            sensitiveDetected: sensitive,
            sensitiveReason: r.sensitiveReason || r.suggestion.sensitiveReason || null,
          }
        })
      )

      if (anySensitive) {
        setSensitivePhotoWarning(
          "This photo may show personal details (face, ID, or address). Retake of the item only is safer — you can still continue."
        )
      }
      if (anyBgKept) {
        setBgKeptNote("Background kept as-is (studio cutout unavailable). You can still continue.")
      }

      const firstSuggestion =
        apiFirst ||
        results.find((r): r is AnalyzeOk => Boolean(r.ok && "suggestion" in r && r.suggestion))?.suggestion
      if (firstSuggestion) {
        setFormData(prev => {
          const gender = normalizeItemGender(firstSuggestion.gender) || prev.gender
          const kids = gender === "girls" || gender === "boys"
          return {
            ...prev,
            itemTitle: prev.itemTitle || firstSuggestion.title,
            category: normalizeLaunchCategory(firstSuggestion.category),
            gender,
            description: prev.description || firstSuggestion.description,
            condition: firstSuggestion.condition || prev.condition,
            brand: prev.brand || firstSuggestion.brand || "",
            size: kids ? "" : prev.size,
          }
        })
        setAiApplied(true)
      } else {
        setAnalyzeError("AI could not read that photo. You can still fill the details manually.")
      }
    } catch (err) {
      console.error("Photo analysis failed:", err)
      setPhotoItems(prev => prev.map(p => (p.status === "analyzing" ? { ...p, status: "pending" } : p)))
      setAnalyzeError(
        "Photo AI is busy right now. You can continue and fill details manually."
      )
    } finally {
      setAnalyzing(false)
    }
  }

  // Blocks "Continue" until the current step's required fields are actually
  // filled - the wizard has no native form submit per step, so nothing else
  // was stopping a donor from skipping straight through with blanks.
  function isStepValid(s: number): boolean {
    if (s === 1) return photoItems.length > 0
    if (s === 2) {
      return (
        formData.itemTitle.trim().length >= 2 &&
        formData.description.trim().length >= 5 &&
        formData.quantity >= 1
      )
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
      const hasPickup = formData.pickupLocality.trim().length >= 2
      const privacyOk = !privacyAddressWarning(formData.pickupLocality)
      if (formData.giverLogistics === "receiver_collects") {
        return (
          hasPickup &&
          privacyOk &&
          formData.dateRange.trim().length > 0 &&
          formData.timeWindow.trim().length > 0
        )
      }
      return hasPickup && privacyOk
    }
    if (s === 5) {
      return (
        formData.recognitionPreference !== "alias" ||
        Boolean((formData.aliasName || profileUsername || "").trim())
      )
    }
    if (s === 6) return true
    if (s === 7) return formData.declaration && formData.acceptedTerms
    if (s === 8) return true
    return true
  }

  const handleNext = async () => {
    if (step === 1) {
      track(AnalyticsEvent.donationStarted, { bulk: uploadMode === "bulk" })
      await analyzePhotos()
    }
    // After item details: go to Login step (guests) or verify session (logged in).
    if (step === 2) {
      if (!getDonorToken()) {
        setStep(8)
        return
      }
      try {
        const { profile } = await api.donor.get<{
          profile: { onboardedAt: string | null } | null
        }>("/api/donor/profile")
        if (!profile?.onboardedAt) {
          await persistGiveDraft(2)
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
      await persistGiveDraft(2)
      navigate(GIVE_LOGIN_PATH)
      return
    }
    setStep(s => {
      const idx = steps.indexOf(s)
      return idx < steps.length - 1 ? steps[idx + 1] : s
    })
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    setSubmitError(null)

    try {
      const processedPaths = photoItems.filter(p => p.status === "done" && p.storagePath).map(p => p.storagePath as string)
      const pendingFiles = photoItems.filter(p => p.status !== "done")

      const kidsGender = formData.gender === "girls" || formData.gender === "boys"
      // Kids use age band on the Wall — never adult XS–XL size.
      const sizeForSubmit = kidsGender ? "" : formData.size
      const ageForSubmit = kidsGender ? formData.age : ""

      const payload: Record<string, string> = {
        itemTitle: formData.itemTitle,
        category: toStorageCategory(formData.category),
        gender: toStorageGender(formData.gender),
        description: formData.description,
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
        pickupLocality: formData.pickupLocality,
        dateRange: formData.dateRange,
        timeWindow: formData.timeWindow,
        notes: formData.notes,
        declaration: "true",
        acceptedTerms: "true",
        giverLogistics: formData.giverLogistics,
        deliveryAddress: formData.deliveryAddress,
        photoStoragePaths: JSON.stringify(processedPaths),
        latitude: formData.latitude != null ? String(formData.latitude) : "",
        longitude: formData.longitude != null ? String(formData.longitude) : "",
      }
      if (formData.porterPaidBy === "receiver" || formData.porterPaidBy === "giver") {
        payload.porterPaidBy = formData.porterPaidBy
      }

      const groups = Array.from(new Set(photoItems.map(p => p.groupId))).sort((a, b) => a - b)
      const isBulk = uploadMode === "bulk" && groups.length > 1

      async function postDonation(body: typeof payload, pending: PhotoItem[]) {
        if (getDonorToken()) {
          if (pending.length === 0) return api.donor.post<{ reference: string }>("/api/donations", body)
          const form = new FormData()
          Object.entries(body).forEach(([k, v]) => form.append(k, String(v)))
          pending.forEach(p => form.append("photos", p.file))
          return api.donor.postForm<{ reference: string }>("/api/donations", form)
        }
        if (pending.length === 0) return api.post<{ reference: string }>("/api/donations", body)
        const form = new FormData()
        Object.entries(body).forEach(([k, v]) => form.append(k, String(v)))
        pending.forEach(p => form.append("photos", p.file))
        return api.postForm<{ reference: string }>("/api/donations", form)
      }

      let result: { reference: string }
      if (!isBulk) {
        result = await postDonation(payload, pendingFiles)
      } else {
        let last = { reference: "" }
        for (const gid of groups) {
          const groupPhotos = photoItems.filter(p => p.groupId === gid)
          const sug = groupPhotos.find(p => p.suggestion)?.suggestion
          const isFirst = gid === groups[0]
          const paths = groupPhotos.filter(p => p.status === "done" && p.storagePath).map(p => p.storagePath as string)
          const pending = groupPhotos.filter(p => p.status !== "done")
          last = await postDonation(
            {
              ...payload,
              itemTitle: (isFirst ? formData.itemTitle : sug?.title) || sug?.title || `Item ${gid + 1}`,
              category: toStorageCategory((isFirst ? formData.category : sug?.category) || "Tops"),
              gender: toStorageGender((isFirst ? formData.gender : sug?.gender) || "unisex"),
              description:
                (isFirst ? formData.description : sug?.description) ||
                sug?.description ||
                "Preloved item ready to Relove.",
              condition: (isFirst ? formData.condition : sug?.condition) || "Good",
              size: isFirst ? sizeForSubmit || ageForSubmit : "",
              brand: (isFirst ? formData.brand : sug?.brand) || sug?.brand || "",
              age: isFirst ? ageForSubmit : "",
              defect: isFirst ? formData.defect : "",
              quantity: String(isFirst ? formData.quantity : 1),
              photoStoragePaths: JSON.stringify(paths),
            },
            pending
          )
        }
        result = last
      }
      track(AnalyticsEvent.donationSubmitted, {
        reference: result.reference,
        category: formData.category,
        bulk: isBulk,
      })
      setIsSubmitting(false)
      sessionStorage.removeItem(GIVE_DRAFT_KEY)
      navigate(`/give/success/${result.reference}?logistics=${encodeURIComponent(formData.giverLogistics)}`)
    } catch (error: any) {
      console.error("Error saving donation:", error)
      track(AnalyticsEvent.donationFailed, {
        category: formData.category,
        message: error?.message || "unknown",
      })
      setSubmitError(error?.message || "Failed to submit. Please try again.")
      setIsSubmitting(false)
    }
  }

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-8 md:py-16">
      <div className="mb-8">
        <h1 className="text-4xl font-display font-black uppercase tracking-tight">Drop an item</h1>
        <div className="mt-6 flex items-center gap-1.5">
           {steps.map(s => (
             <div key={s} className="flex-1 flex flex-col gap-1.5 min-w-0">
               <div className={`h-1.5 rounded-none ${steps.indexOf(s) <= steps.indexOf(step) ? "bg-foreground" : "bg-black/10"}`} />
               <span
                 className={`text-[9px] sm:text-[10px] font-black uppercase tracking-wider truncate ${
                   s === step ? "text-foreground" : "text-foreground-muted"
                 }`}
               >
                 {STEP_LABELS[s] || s}
               </span>
             </div>
           ))}
        </div>
      </div>

      <div className="bg-white border-2 border-foreground p-6 md:p-8 shadow-[8px_8px_0px_rgba(0,0,0,1)] min-h-[500px] flex flex-col">
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
                <p className="text-foreground-muted">Take photos or choose from your gallery. You can add up to {photoLimit} photos for a single item — they'll be tagged as Photo 1, 2, 3, etc. We will ask for the details next.</p>
              </div>

              <PrivacyPhotoNotice />

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setUploadMode("single")
                    setPhotoItems(prev => prev.map(p => ({ ...p, groupId: 0 })))
                  }}
                  className={`h-12 border-2 border-foreground text-xs font-black uppercase tracking-widest ${
                    uploadMode === "single" ? "bg-accent-pink" : "bg-white hover:bg-black/5"
                  }`}
                >
                  One Item
                </button>
                <button
                  type="button"
                  onClick={() => setUploadMode("bulk")}
                  className={`h-12 border-2 border-foreground text-xs font-black uppercase tracking-widest ${
                    uploadMode === "bulk" ? "bg-accent-pink" : "bg-white hover:bg-black/5"
                  }`}
                >
                  Multiple Items
                </button>
              </div>
              {uploadMode === "bulk" ? (
                <p className="text-xs text-foreground-muted leading-relaxed border-l-2 border-foreground pl-3">
                  Every photo you add is treated as a <strong>separate</strong> item. You’ll review the first item’s details; the rest use AI suggestions on submit.
                  {uniqueGroupCount > 0 ? ` · ${uniqueGroupCount} item${uniqueGroupCount === 1 ? "" : "s"}` : ""}
                </p>
              ) : (
                <p className="text-xs text-foreground-muted leading-relaxed border-l-2 border-foreground pl-3">
                  You can select <strong>up to {photoLimit} photos</strong> of the same item (front, back, tag, details). Pick several at once from your gallery.
                </p>
              )}

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
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {photoItems.map((p, index) => {
                      const uniqueGroups = Array.from(new Set(photoItems.map(x => x.groupId))).sort((a, b) => a - b)
                      const itemNum = uniqueGroups.indexOf(p.groupId) + 1
                      const photosInGroup = photoItems.filter(x => x.groupId === p.groupId)
                      const photoNum = uploadMode === "single" ? photosInGroup.indexOf(p) + 1 : null
                      return (
                      <div key={index} className="relative aspect-square border-2 border-foreground bg-surface-muted">
                        <img src={p.previewUrl} alt={`Upload ${index + 1}`} className="w-full h-full object-cover" />
                        {uploadMode === "bulk" ? (
                          <span className="absolute top-2 left-2 bg-white border-2 border-foreground px-1.5 py-0.5 text-[10px] font-black uppercase tracking-widest">
                            Item {itemNum}
                          </span>
                        ) : (
                          <span className="absolute top-2 left-2 bg-white border-2 border-foreground px-1.5 py-0.5 text-[10px] font-black uppercase tracking-widest">
                            Photo {photoNum}
                          </span>
                        )}
                        {p.status === "done" && (
                          <span className="absolute bottom-2 left-2 flex items-center gap-1 bg-accent-green border-2 border-foreground px-1.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-foreground shadow-[1px_1px_0px_rgba(0,0,0,1)]">
                            <Sparkles className="w-3 h-3" /> AI enhanced
                          </span>
                        )}
                        {analyzing && p.status === "pending" && (
                          <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                            <Loader2 className="w-6 h-6 animate-spin text-foreground" />
                          </div>
                        )}
                        <button type="button" onClick={() => removePhoto(index)} className="absolute top-2 right-2 p-1 bg-white border-2 border-foreground shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all z-10">
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
                    <Sparkles className="w-3.5 h-3.5" /> Our AI removes people and the background so only the item shows, and pre-fills details from your photo — you’ll confirm everything on the next step.
                  </p>
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
                 <p className="text-foreground-muted">Tell us about what you are passing on.</p>
               </div>

               {aiApplied && (
                 <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest bg-accent-green/15 text-foreground border-2 border-foreground px-3 py-2">
                   <Sparkles className="w-4 h-4" /> Pre-filled from your photo by AI - please review and edit.
                 </div>
               )}

               <div className="flex flex-col gap-4">
                 <div className="flex flex-col gap-1.5">
                   <label className="text-sm font-bold uppercase tracking-widest text-foreground">Item Title *</label>
                   <Input value={formData.itemTitle} onChange={e => setFormData({...formData, itemTitle: e.target.value})} placeholder="e.g. Vintage Denim Jacket" className="rounded-none border-2 border-foreground" />
                 </div>
                 
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <div className="flex flex-col gap-1.5">
                     <label className="text-sm font-bold uppercase tracking-widest text-foreground">Category *</label>
                     <select 
                        value={
                          DROP_CATEGORY_OPTIONS.some((o) => o.value === formData.category)
                            ? formData.category
                            : formData.category === "Kicks"
                              ? "Kicks"
                              : formData.category === "Bags"
                                ? "Bags"
                                : "Tops"
                        } 
                        onChange={e => setFormData({...formData, category: e.target.value})}
                        className="flex h-10 w-full bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 rounded-none border-2 border-foreground"
                      >
                       {DROP_CATEGORY_OPTIONS.map(({ label, value }) => (
                         <option key={value} value={value}>{label}</option>
                       ))}
                     </select>
                   </div>

                   <div className="flex flex-col gap-1.5">
                     <label className="text-sm font-bold uppercase tracking-widest text-foreground">Condition *</label>
                     <select 
                        value={formData.condition} 
                        onChange={e => setFormData({...formData, condition: e.target.value})}
                        className="flex h-10 w-full bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 rounded-none border-2 border-foreground"
                      >
                       <option value="Excellent">Excellent</option>
                       <option value="Good">Good</option>
                       <option value="Fair but fully usable">Fair but fully usable</option>
                     </select>
                   </div>
                 </div>

                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <div className="flex flex-col gap-1.5">
                     <label className="text-sm font-bold uppercase tracking-widest text-foreground">Size</label>
                     {APPAREL_CATEGORIES.includes(formData.category as (typeof APPAREL_CATEGORIES)[number]) || formData.category === "Tops" ? (
                       <select
                         value={formData.size}
                         onChange={e => setFormData({...formData, size: e.target.value})}
                         className="flex h-10 w-full bg-background px-3 py-2 text-sm rounded-none border-2 border-foreground"
                       >
                         <option value="">Optional</option>
                         {APPAREL_SIZES.map(s => (
                           <option key={s} value={s}>{s}</option>
                         ))}
                       </select>
                     ) : (
                       <Input
                         value={formData.size}
                         onChange={e => setFormData({...formData, size: e.target.value})}
                         placeholder={formData.category === "Kicks" ? "e.g. EU 40 / UK 6" : "Optional"}
                         className="rounded-none border-2 border-foreground"
                       />
                     )}
                   </div>
                   <div className="flex flex-col gap-1.5">
                     <label className="text-sm font-bold uppercase tracking-widest text-foreground">Brand</label>
                     <Input value={formData.brand} onChange={e => setFormData({...formData, brand: e.target.value})} placeholder="Optional" className="rounded-none border-2 border-foreground" />
                   </div>
                 </div>
                 
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <div className="flex flex-col gap-1.5">
                     <label className="text-sm font-bold uppercase tracking-widest text-foreground">Quantity *</label>
                     <Input type="number" min="1" value={formData.quantity} onChange={e => setFormData({...formData, quantity: parseInt(e.target.value) || 1})} className="rounded-none border-2 border-foreground" />
                   </div>
                 </div>

                 <div className="flex flex-col gap-1.5">
                   <label className="text-sm font-bold uppercase tracking-widest text-foreground">Description *</label>
                   <Textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="Why are you giving it away? What should someone know?" className="rounded-none border-2 border-foreground h-24" />
                 </div>
                 
                 <div className="flex flex-col gap-1.5">
                   <label className="text-sm font-bold uppercase tracking-widest text-foreground">Any defects? (Optional)</label>
                   <Input value={formData.defect} onChange={e => setFormData({...formData, defect: e.target.value})} placeholder="e.g. Missing a button, minor scratch - leave blank if none" className="rounded-none border-2 border-foreground" />
                 </div>
               </div>
             </motion.div>
          )}

          {step === 3 && (
             <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col gap-6 flex-1">
               <div>
                 <h2 className="text-3xl font-display font-bold uppercase mb-2">Donor Details</h2>
                 <p className="text-foreground-muted">How we can contact you regarding this donation.</p>
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
                     <Input type="tel" inputMode="numeric" maxLength={10} value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value.replace(/\D/g, "").slice(0, 10)})} className="rounded-none border-2 border-foreground" />
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
                   value={formData.giverLogistics}
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
                   {(Object.entries(GIVER_LOGISTICS_LABELS) as [GiverLogistics, string][]).map(([value, label]) => (
                     <option key={value} value={value}>{label}</option>
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
                     Receivers are matched within <span className="font-bold text-foreground">3 km</span> of your building. They share a delivery address only after you accept.
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
                     Reloved matches you — it does not run the courier. After you Accept, the claimer books prepaid Borzo (gate to gate, ops phone only).
                     First 500 rides: Reloved pays. After that, the receiver reimburses Reloved once (~₹40–80). The item stays ₹0 free; no COD.
                   </p>
                   <div className="flex flex-col gap-1.5">
                     <label className="text-sm font-bold uppercase tracking-widest text-foreground">Pickup building / landmark *</label>
                     <AddressAutocomplete
                       value={formData.pickupLocality}
                       onChange={val => setFormData({ ...formData, pickupLocality: val, porterPaidBy: "receiver" })}
                       placeholder="Search building or landmark — no flat or wing"
                       className="rounded-none border-2 border-foreground bg-white"
                     />
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
                     <img key={i} src={p.previewUrl} alt="Upload preview" className="w-full aspect-square object-cover border-2 border-foreground bg-surface-muted" />
                   ))}
                 </div>
                 
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
                       {formData.category === "Kicks" ? "Shoes" : formData.category === "Bags" ? "Bags" : "Clothes"}
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

                 <div className="bg-surface-muted border-2 border-foreground p-4">
                   <div className="flex justify-between items-center mb-4 border-b-2 border-foreground/10 pb-2">
                     <h3 className="font-bold uppercase tracking-widest">Handover</h3>
                     <button type="button" onClick={() => setStep(4)} className="text-xs font-bold underline">Edit</button>
                   </div>
                   <div className="grid grid-cols-1 gap-y-4 text-sm">
                     <div>
                       <span className="text-foreground-muted font-bold block text-xs uppercase tracking-widest">Option</span>
                       {GIVER_LOGISTICS_LABELS[formData.giverLogistics]}
                     </div>
                     <div>
                       <span className="text-foreground-muted font-bold block text-xs uppercase tracking-widest">Building / landmark</span>
                       {formData.pickupLocality || "-"}
                     </div>
                     {formData.giverLogistics === "receiver_collects" && (
                       <div>
                         <span className="text-foreground-muted font-bold block text-xs uppercase tracking-widest">When</span>
                         {[formData.dateRange, formData.timeWindow].filter(Boolean).join(" · ") || "-"}
                       </div>
                     )}
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
                  Your photos and details are saved. Verify your email to create or open your account, then we bring you back to finish the drop.
                </p>
              </div>
              <div className="border-2 border-foreground bg-surface-muted p-4 text-sm flex flex-col gap-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">Ready to post</p>
                <p className="font-bold">{formData.itemTitle || "Your item"}</p>
                <p className="text-foreground-muted">
                  {photoItems.length} photo{photoItems.length === 1 ? "" : "s"} · {formData.category || "Clothes"}
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
                     {formData.itemTitle || "Untitled"} · {GIVER_LOGISTICS_LABELS[formData.giverLogistics]} ·{" "}
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

        <div className="mt-8 flex flex-col-reverse sm:flex-row sm:justify-between gap-3 pt-6 border-t-2 border-foreground">
          <Button variant="ghost" onClick={handleBack} disabled={step === 1} className="font-bold uppercase tracking-widest hover:bg-black/5 rounded-none w-full sm:w-auto">
            Back
          </Button>
          
          {step === 7 ? (
            <div className="flex flex-col items-stretch sm:items-end gap-2 max-w-md w-full sm:w-auto">
              <Button variant="cta" onClick={handleSubmit} disabled={!formData.declaration || !formData.acceptedTerms || isSubmitting || !( /^[6-9]\d{9}$/.test(formData.phone) || formData.email.trim().includes("@") || Boolean(getDonorToken()) )} className="font-bold uppercase tracking-widest w-full sm:w-auto">
                {isSubmitting ? 'Submitting...' : 'I Accept - Submit'}
              </Button>
              <LegalReadMore className="text-left sm:text-right" />
            </div>
          ) : (
            <Button variant="cta" onClick={handleNext} disabled={!isStepValid(step) || analyzing || compressingPhotos} className="font-bold uppercase tracking-widest w-full sm:w-auto">
              {step === 1 && analyzing ? (
                <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Analyzing photos...</span>
              ) : step === 1 && compressingPhotos ? (
                <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Adding photo…</span>
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

