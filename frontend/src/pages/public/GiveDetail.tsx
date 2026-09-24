import { useEffect, useState } from "react"
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom"
import { ArrowLeft, Copy, Check, ExternalLink } from "lucide-react"
import { api, resolveImageUrl } from "@/lib/api"
import { getDonorToken } from "@/lib/donorSession"
import { DualChatOptions } from "@/components/chat/DualChatOptions"
import { Button } from "@/components/ui/Button"
import { NoticeModal, type NoticeState } from "@/components/ui/NoticeModal"
import { normalizeBorzoTrackingUrl, isBrokenBorzoTestTrackUrl, copySelfServeCourierBooking, openShiprocket, extractIndiaPincode /* , openBorzo, openPorter */ } from "@/lib/logisticsLinks"
import { SafeImage } from "@/components/ui/SafeImage"
import { usesExternalCourier } from "@shared/taxonomy"
import { ScheduleHandoverPanel, scheduleAllowsHandedOver } from "@/components/handover/ScheduleHandoverPanel"
import { Input } from "@/components/ui/Input"
import { Textarea } from "@/components/ui/Textarea"
import {
  APPAREL_SIZES,
  DROP_CATEGORY_OPTIONS,
  DROP_GENDER_OPTIONS,
  KIDS_AGE_BANDS,
  SIZE_REQUIRED_CATEGORIES,
  normalizeItemGender,
  normalizeLaunchCategory,
} from "@shared/taxonomy"

interface Submission {
  id: string
  reference: string
  status: string
  submittedAt: string
  locality?: string | null
  address?: string | null
  giverLogistics?: string | null
  items: {
    id: string
    slug: string
    title: string
    category: string
    description?: string | null
    condition?: string | null
    brand?: string | null
    gender?: string | null
    size?: string | null
    quantity?: number
    status: string
    publicVisibility: boolean
    publicStatus?: string | null
    locality?: string | null
    giverLogistics?: string | null
    images: { storagePath: string }[]
    claim?: {
      id: string
      status: string
      handoverStage?: string | null
      requesterName?: string | null
      requesterAddress?: string | null
      requesterPhone?: string | null
      addressSaved?: boolean
      giverLogistics?: string | null
      pickupAddressConfirmedByGiver?: boolean
      dropAddressConfirmedByClaimer?: boolean
      proposedSlotAt?: string | null
      proposedSlotBy?: string | null
      proposedSlots?: string[] | null
      scheduleMode?: string | null
      agreedSlotAt?: string | null
      opsBookingStatus?: string | null
      deliveryStatus?: string | null
      borzoTrackingUrl?: string | null
      borzoStatus?: string | null
      borzoCourier?: { name?: string; phone?: string } | null
      shiprocketOrderId?: number | string | null
      shiprocketStatus?: string | null
      shiprocketAwb?: string | null
      shiprocketTrackingUrl?: string | null
      shiprocketPaymentMethod?: string | null
      shadowfaxOrderId?: string | null
      shadowfaxStatus?: string | null
      shadowfaxAwb?: string | null
      shadowfaxTrackingUrl?: string | null
      shadowfaxPaymentMethod?: string | null
    } | null
    delivery?: {
      deliveryStatus?: string | null
      borzoTrackingUrl?: string | null
      borzoStatus?: string | null
      borzoCourier?: { name?: string; phone?: string } | null
    } | null
  }[]
}

export function GiveDetail() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const claimFocusId = String(searchParams.get("claim") || "").trim()
  const itemFocusId = String(searchParams.get("item") || "").trim()
  const navigate = useNavigate()
  const [submission, setSubmission] = useState<Submission | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [booking, setBooking] = useState(false)
  const [copiedBooking, setCopiedBooking] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [declineOpen, setDeclineOpen] = useState(false)
  const [declineClaimId, setDeclineClaimId] = useState<string | null>(null)
  const [declineReason, setDeclineReason] = useState("too_far")
  const [notice, setNotice] = useState<NoticeState | null>(null)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    category: "Tops",
    condition: "Good",
    size: "",
    brand: "",
    gender: "unisex",
    quantity: 1,
  })
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  async function reload() {
    if (!id) return
    const { submissions } = await api.donor.get<{ submissions: Submission[] }>("/api/donor/submissions")
    const found = (submissions || []).find((s) => s.id === id) || null
    setSubmission(found)
  }

  useEffect(() => {
    if (!getDonorToken()) {
      navigate("/account/login", { replace: true, state: { redirect: `/account/gifts/${id}` } })
      return
    }
    if (!id) return
    setLoading(true)
    api.donor
      .get<{ submissions: Submission[] }>("/api/donor/submissions")
      .then(({ submissions }) => {
        const found = (submissions || []).find((s) => s.id === id) || null
        if (!found) setError("This donation wasn't found on your account.")
        setSubmission(found)
      })
      .catch((err: any) => setError(err?.message || "Couldn't load donation"))
      .finally(() => setLoading(false))
  }, [id, navigate])

  useEffect(() => {
    const title = submission?.items?.[0]?.title
    if (title) document.title = `reloved | ${title}`
    else if (submission) document.title = "reloved | Your gift"
  }, [submission])

  // Deep-link ?edit=1 from Giving history — must run before any early return
  // so hook order stays stable (otherwise React blank-screens this route).
  useEffect(() => {
    if (loading || error || !submission) return
    if (searchParams.get("edit") !== "1") return
    const claimFocus = String(searchParams.get("claim") || "").trim()
    const itemFocus = String(searchParams.get("item") || "").trim()
    const allPending = submission.items.filter((i) => i.claim?.status === "pending" && i.claim?.id)
    const heroItem =
      (itemFocus ? submission.items.find((i) => i.id === itemFocus) : null) ||
      (claimFocus ? submission.items.find((i) => i.claim?.id === claimFocus) : null) ||
      (allPending.length === 1 ? allPending[0] : null) ||
      submission.items.find((i) => i.claim?.status === "approved") ||
      submission.items.find((i) => i.claim?.status === "pending") ||
      submission.items[0]
    if (!heroItem?.id) return
    const ps = String(heroItem.publicStatus || "")
    const claimStatus = String(heroItem.claim?.status || "")
    // No edit once a claim is in flight or the item is matched / Reloved.
    if (
      ["being_matched", "claimed", "reloved", "withdrawn"].includes(ps) ||
      claimStatus === "pending" ||
      claimStatus === "approved"
    ) {
      return
    }
    if (editingItemId === heroItem.id) return
    beginEditItem(heroItem)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, error, submission, searchParams, editingItemId])

  function beginEditItem(item: Submission["items"][number]) {
    const gender = normalizeItemGender(item.gender || "unisex")
    const category = normalizeLaunchCategory(item.category || "Tops")
    setEditForm({
      title: item.title || "",
      description: item.description || "",
      category,
      condition: item.condition || "Good",
      size: item.size || "",
      brand: item.brand || "",
      gender,
      quantity: item.quantity || 1,
    })
    setEditError(null)
    setEditingItemId(item.id)
  }

  async function saveEditItem() {
    if (!editingItemId) return
    const gender = normalizeItemGender(editForm.gender)
    const category = normalizeLaunchCategory(editForm.category)
    const kids = gender === "girls" || gender === "boys"
    if (editForm.title.trim().length < 2) {
      setEditError("Title needs at least 2 characters.")
      return
    }
    if (kids && !String(editForm.size || "").trim()) {
      setEditError("Select an age band for kids items.")
      return
    }
    if (!kids && (SIZE_REQUIRED_CATEGORIES as readonly string[]).includes(category) && !editForm.size.trim()) {
      setEditError("Size is required for apparel and shoes.")
      return
    }
    setEditSaving(true)
    setEditError(null)
    try {
      await api.donor.patch(`/api/donor/items/${editingItemId}`, {
        title: editForm.title.trim(),
        description: editForm.description.trim(),
        category,
        condition: editForm.condition,
        size: editForm.size.trim(),
        brand: editForm.brand.trim(),
        gender,
        quantity: editForm.quantity,
      })
      await reload()
      setEditingItemId(null)
      setNotice({ title: "Item updated", body: "Your changes are saved.", tone: "ok" })
    } catch (err: any) {
      setEditError(err?.message || "Couldn't save changes.")
    } finally {
      setEditSaving(false)
    }
  }

  if (loading) {
    return <div className="max-w-2xl mx-auto px-4 py-16 h-64 bg-surface-muted border-2 border-foreground animate-pulse" />
  }

  if (error || !submission) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 flex flex-col gap-4">
        <p className="font-bold text-accent-red">{error || "Not found"}</p>
        <Link to="/account" className="text-sm font-black uppercase tracking-widest underline">
          Back to account
        </Link>
      </div>
    )
  }

  const approved = submission.status === "approved"
  // Deep-link from notification/email: show the exact claimed article, not item[0].
  const allPendingItemClaims = submission.items
    .filter((i) => i.claim?.status === "pending" && i.claim?.id)
    .map((i) => ({ item: i, claim: i.claim! }))
  const claimFocusMissing =
    Boolean(claimFocusId) && !submission.items.some((i) => i.claim?.id === claimFocusId)
  // One claim at a time: when ?claim= is present, only that request; never the whole bag.
  const pendingItemClaims =
    claimFocusId && !claimFocusMissing
      ? allPendingItemClaims.filter(({ claim }) => claim.id === claimFocusId)
      : claimFocusId && claimFocusMissing
        ? []
        : allPendingItemClaims.length > 1
          ? [] // force picker below — don't stack Accept on every piece
          : allPendingItemClaims
  const focusItem =
    (itemFocusId
      ? submission.items.find((i) => i.id === itemFocusId)
      : null) ||
    (claimFocusId
      ? submission.items.find((i) => i.claim?.id === claimFocusId)
      : null) ||
    (allPendingItemClaims.length === 1 ? allPendingItemClaims[0].item : null) ||
    submission.items.find((i) => i.claim?.status === "approved") ||
    submission.items.find((i) => i.claim?.status === "pending") ||
    submission.items[0]
  const hero = focusItem
  const imageSrc = hero ? resolveImageUrl(hero.images?.[0]?.storagePath) : undefined
  // Only surface claim/delivery chrome for the focused article (not a sibling in the bag).
  const liveClaim =
    (claimFocusId
      ? submission.items.find((i) => i.claim?.id === claimFocusId)?.claim
      : null) ||
    hero?.claim ||
    null
  const activeDelivery = liveClaim
    ? hero?.delivery || null
    : null
  const logistics = String(liveClaim?.giverLogistics || submission.giverLogistics || hero?.giverLogistics || "")
  const isPersonalDriver = logistics === "personal_driver"
  const rawTrackUrl = activeDelivery?.borzoTrackingUrl || null
  const trackUrl = isPersonalDriver ? null : normalizeBorzoTrackingUrl(rawTrackUrl)
  const trackBroken = isPersonalDriver ? false : isBrokenBorzoTestTrackUrl(rawTrackUrl)
  const pickupBuilding =
    String(hero?.locality || submission.locality || submission.address || "").trim() ||
    "Your building main gate (use your Reloved pickup building)"

  const dropBuilding = String(liveClaim?.requesterAddress || "").trim()
  // Bulk bags used to list every sibling here — noisy while editing one piece.
  // Giving history already lists each article; keep this page focused on `hero`.
  const otherItems: Submission["items"] = []
  const needsClaimPicker = !claimFocusId && !itemFocusId && allPendingItemClaims.length > 1

  // Hide ops bulk refs (WSM-/USM- batch codes); keep normal RL- style track refs.
  const displayReference = (() => {
    const ref = String(submission.reference || "").trim()
    if (!ref) return null
    if (/^(wsm|usm|batch)[-_]/i.test(ref)) return null
    if (/-shirts-|-pants-|-tops-/i.test(ref)) return null
    return ref
  })()


  async function copyText(label: string, value: string) {
    const text = String(value || "").trim()
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(label)
      window.setTimeout(() => setCopiedField(null), 2000)
    } catch {
      setNotice({ title: "Couldn't copy", body: "Long-press the text to copy instead.", tone: "warn" })
    }
  }

  async function copyAllClaimerDetails() {
    const lines = [
      liveClaim?.requesterName ? `Name: ${liveClaim.requesterName}` : null,
      liveClaim?.requesterPhone ? `Phone: ${liveClaim.requesterPhone}` : null,
      liveClaim?.requesterAddress ? `Address: ${liveClaim.requesterAddress}` : null,
      "Rider note: Collect from building main gate security. Do not call flat.",
    ].filter(Boolean)
    if (lines.length === 0) return
    await copyText("all", lines.join("\n"))
  }

  async function openCourierApp(carrier: "shiprocket" | "borzo" | "porter" = "shiprocket") {
    setBooking(true)
    try {
      await copySelfServeCourierBooking({
        pickupBuilding,
        dropBuilding: dropBuilding || "Receiver building gate (confirm area in chat — exact flat stays private)",
        itemTitle: hero?.title,
        reference: submission.reference,
      })
      setCopiedBooking(true)
      window.setTimeout(() => setCopiedBooking(false), 2500)
      // if (carrier === "porter") openPorter()
      // else if (carrier === "borzo") openBorzo()
      // else
      openShiprocket()
      setNotice({
        title: "Shiprocket opening",
        body: "Pickup + drop are copied. Paste in Shiprocket Quick / Instant Delivery. Prefer gate / landmark on the rider note.",
        tone: "ok",
      })
    } catch (err: any) {
      setNotice({
        title: "Couldn't open courier",
        body: err?.message || "Try again, or open Shiprocket and enter addresses manually.",
        tone: "error",
      })
    } finally {
      setBooking(false)
    }
  }

  async function giverDecision(claimId: string, decision: "accept" | "decline", reason?: string) {
    if (!claimId) return
    setBusy(true)
    try {
      await api.donor.post(`/api/donor/item-requests/${claimId}/giver-decision`, {
        decision,
        ...(decision === "decline" ? { reason: reason || declineReason } : {}),
      })
      setDeclineOpen(false)
      setDeclineClaimId(null)
      // Stay on this one claim so Accept/handover never jumps to sibling pieces.
      navigate(`/account/gifts/${submission.id}?claim=${encodeURIComponent(claimId)}`, { replace: true })
      await reload()
    } catch (err: any) {
      setNotice({ title: "Couldn't save", body: err?.message || "Couldn't save decision", tone: "error" })
    } finally {
      setBusy(false)
    }
  }

  async function markHandedOver() {
    if (!liveClaim) return
    setBusy(true)
    try {
      await api.donor.post(`/api/donor/item-requests/${liveClaim.id}/handed-over`, {})
      await reload()
    } catch (err: any) {
      setNotice({ title: "Couldn't update", body: err?.message || "Couldn't mark handed over", tone: "error" })
    } finally {
      setBusy(false)
    }
  }

  async function removeListing() {
    setNotice({
      title: approved ? "Remove from Wall?" : "Remove listing?",
      body: approved
        ? "This will take the item off the Wall of Kindness. You can drop again anytime."
        : "This will remove the listing from your account.",
      tone: "warn",
      primaryLabel: "Remove",
      secondaryLabel: "Cancel",
      onSecondary: () => setNotice(null),
      promptLabel: "Reason (optional)",
      promptPlaceholder: "e.g. Kept it, wrong photos, changed my mind…",
      promptRequired: false,
      onPrimary: (reason) => {
        void (async () => {
          setBusy(true)
          try {
            await api.donor.delete(`/api/donor/submissions/${submission.id}`, { reason: reason || "" })
            navigate("/account?tab=giving")
          } catch (err: any) {
            setNotice({ title: "Couldn't remove", body: err?.message || "Couldn't remove listing", tone: "error" })
          } finally {
            setBusy(false)
          }
        })()
      },
    })
  }

  async function setItemOffWall(itemId: string) {
    setNotice({
      title: "Remove this item from Wall?",
      body: "Only this piece comes off the Wall. Other items from the same drop stay live.",
      tone: "warn",
      primaryLabel: "Remove this item",
      secondaryLabel: "Cancel",
      onSecondary: () => setNotice(null),
      onPrimary: () => {
        void (async () => {
          setBusy(true)
          setNotice(null)
          try {
            await api.donor.post(`/api/donor/items/${itemId}/withdraw`, {})
            await reload()
            setNotice({
              title: "Removed",
              body: "That item is off the Wall. Sibling pieces are unchanged.",
              tone: "ok",
            })
          } catch (err: any) {
            setNotice({
              title: "Couldn't remove",
              body: err?.message || "Couldn't take this item off the Wall. Message Reloved chat for help.",
              tone: "error",
            })
          } finally {
            setBusy(false)
          }
        })()
      },
    })
  }

  function requestBookBorzo() {
    if (!liveClaim?.id) return
    if (!(liveClaim.addressSaved || liveClaim.requesterAddress)) {
      setNotice({
        title: "Address needed",
        body: "Wait for the receiver's building to be saved, then tap Book Shiprocket.",
        tone: "warn",
      })
      return
    }
    const dropPin = extractIndiaPincode(liveClaim.requesterAddress)
    if (!dropPin) {
      setNotice({
        title: "Pincode needed",
        body: "The claimer's building is missing a 6-digit pincode (e.g. 400051).\n\nAsk them to update Delivery building on their claim page, then book again.",
        tone: "warn",
      })
      return
    }
    setNotice({
      title: "Book Shiprocket?",
      body: "This books a courier from your gate to the claimer's gate.\n\nFirst 500 rides: Reloved wallet pays automatically.\nAfter that: claimer pays COD when the bag arrives.\n\nLeave the bag at main gate security — do not share flat numbers.",
      tone: "warn",
      primaryLabel: "Confirm book",
      onPrimary: () => void runBookShiprocket(),
      secondaryLabel: "Cancel",
      onSecondary: () => setNotice(null),
    })
  }

  async function runBookShiprocket() {
    if (!liveClaim?.id) return
    setBooking(true)
    try {
      const res = await api.donor.post<{
        ok: boolean
        assigned?: boolean
        paymentMethod?: string
        message?: string
        order: { orderId?: number; trackingUrl?: string | null; awbCode?: string | null }
      }>(`/api/donor/item-requests/${liveClaim.id}/shiprocket/book`)
      await reload()
      setNotice({
        title: res.assigned ? "Shiprocket booked" : "Order created",
        body:
          res.message ||
          `Order #${res.order?.orderId || "?"} created.\n\nLeave the bag at main gate security — the rider will collect.`,
        tone: res.assigned ? "ok" : "warn",
        primaryLabel: res.order?.trackingUrl ? "Track rider" : "Done",
        onPrimary: res.order?.trackingUrl
          ? () => window.open(res.order.trackingUrl!, "_blank", "noopener,noreferrer")
          : undefined,
      })
    } catch (err: any) {
      const already = err?.alreadyBooked || /already (exists|booked)/i.test(String(err?.message || ""))
      setNotice({
        title: already ? "Already booked" : "Booking failed",
        body: already
          ? `${err?.message || "A Shiprocket order is already on this claim."}\n\nUse Cancel Shiprocket below if you need to rebook.`
          : err?.message || "Failed to book Shiprocket",
        tone: already ? "warn" : "error",
      })
      if (already) await reload()
    } finally {
      setBooking(false)
    }
  }

  function requestBookShadowfax() {
    if (!liveClaim?.id) return
    if (!(liveClaim.addressSaved || liveClaim.requesterAddress)) {
      setNotice({
        title: "Address needed",
        body: "Wait for the receiver's building to be saved, then tap Book Shadowfax.",
        tone: "warn",
      })
      return
    }
    const dropPin = extractIndiaPincode(liveClaim.requesterAddress)
    if (!dropPin) {
      setNotice({
        title: "Pincode needed",
        body: "The claimer's building is missing a 6-digit pincode (e.g. 400051).\n\nAsk them to update Delivery building on their claim page, then book again.",
        tone: "warn",
      })
      return
    }
    setNotice({
      title: "Book Shadowfax?",
      body: "Local A/B test — books Shadowfax gate → gate.\n\nFirst 500: Reloved prepaid.\nAfter: claimer COD.\n\nLeave the bag at main gate security.",
      tone: "warn",
      primaryLabel: "Confirm book",
      onPrimary: () => void runBookShadowfax(),
      secondaryLabel: "Cancel",
      onSecondary: () => setNotice(null),
    })
  }

  async function runBookShadowfax() {
    if (!liveClaim?.id) return
    setBooking(true)
    try {
      const res = await api.donor.post<{
        ok: boolean
        assigned?: boolean
        message?: string
        order: { orderId?: string; trackingUrl?: string | null; awbCode?: string | null }
      }>(`/api/donor/item-requests/${liveClaim.id}/shadowfax/book`)
      await reload()
      setNotice({
        title: res.assigned ? "Shadowfax booked" : "Order created",
        body:
          res.message ||
          `Order #${res.order?.orderId || "?"} created.\n\nLeave the bag at main gate security.`,
        tone: res.assigned ? "ok" : "warn",
        primaryLabel: res.order?.trackingUrl ? "Track rider" : "Done",
        onPrimary: res.order?.trackingUrl
          ? () => window.open(res.order.trackingUrl!, "_blank", "noopener,noreferrer")
          : undefined,
      })
    } catch (err: any) {
      const already = err?.alreadyBooked || /already (exists|booked)/i.test(String(err?.message || ""))
      setNotice({
        title: already ? "Already booked" : "Booking failed",
        body: already
          ? `${err?.message || "A Shadowfax order is already on this claim."}\n\nUse Cancel Shadowfax below if you need to rebook.`
          : err?.message || "Failed to book Shadowfax",
        tone: already ? "warn" : "error",
      })
      if (already) await reload()
    } finally {
      setBooking(false)
    }
  }

  function requestCancelShiprocket() {
    if (!liveClaim?.id) return
    setNotice({
      title: "Cancel Shiprocket?",
      body: `Cancel order #${liveClaim.shiprocketOrderId}? You can book again after canceling.`,
      tone: "warn",
      primaryLabel: "Yes, cancel",
      secondaryLabel: "Keep order",
      onSecondary: () => setNotice(null),
      onPrimary: () => void runCancelShiprocket(),
    })
  }

  async function runCancelShiprocket() {
    if (!liveClaim?.id) return
    setBooking(true)
    setNotice(null)
    try {
      const res = await api.donor.post<{ ok: boolean; message?: string }>(
        `/api/donor/item-requests/${liveClaim.id}/shiprocket/cancel`
      )
      await reload()
      setNotice({
        title: "Canceled",
        body: res.message || "Shiprocket order canceled. You can Book Shiprocket again.",
        tone: "ok",
      })
    } catch (err: any) {
      setNotice({ title: "Cancel failed", body: err?.message || "Couldn't cancel Shiprocket", tone: "error" })
    } finally {
      setBooking(false)
    }
  }

  function requestCancelShadowfax() {
    if (!liveClaim?.id) return
    setNotice({
      title: "Cancel Shadowfax?",
      body: `Cancel order #${liveClaim.shadowfaxOrderId}? You can book again after canceling.`,
      tone: "warn",
      primaryLabel: "Yes, cancel",
      secondaryLabel: "Keep order",
      onSecondary: () => setNotice(null),
      onPrimary: () => void runCancelShadowfax(),
    })
  }

  async function runCancelShadowfax() {
    if (!liveClaim?.id) return
    setBooking(true)
    setNotice(null)
    try {
      const res = await api.donor.post<{ ok: boolean; message?: string }>(
        `/api/donor/item-requests/${liveClaim.id}/shadowfax/cancel`
      )
      await reload()
      setNotice({
        title: "Canceled",
        body: res.message || "Shadowfax order canceled. You can Book Shadowfax again.",
        tone: "ok",
      })
    } catch (err: any) {
      setNotice({ title: "Cancel failed", body: err?.message || "Couldn't cancel Shadowfax", tone: "error" })
    } finally {
      setBooking(false)
    }
  }

  return (
    <div className="w-full max-w-2xl mx-auto px-4 pt-4 sm:pt-6 pb-16 flex flex-col gap-6 min-w-0">
      <Link
        to="/account"
        className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest w-fit"
      >
        <ArrowLeft size={14} /> Back to account
      </Link>

      <div className="bg-white border-2 border-foreground shadow-[8px_8px_0px_rgba(0,0,0,1)] overflow-hidden min-w-0">
        {hero && (
          <div className="relative h-[280px] sm:h-[360px] border-b-2 border-foreground bg-[#f0eee8]">
            <SafeImage
              src={imageSrc}
              alt={hero.title}
              priority
              className="absolute inset-0 w-full h-full object-contain p-4 sm:p-6"
            />
          </div>
        )}

        <div className="p-5 sm:p-8 flex flex-col gap-5">
          <div className="flex gap-4 items-start">
            {hero && (
              <div className="w-16 h-16 shrink-0 border-2 border-foreground bg-white overflow-hidden">
                <SafeImage
                  src={imageSrc}
                  alt=""
                  showSkeleton={false}
                  className="w-full h-full object-contain"
                />
              </div>
            )}
            <div className="flex flex-col gap-2 min-w-0 flex-1">
              {displayReference && (
                <span className="text-xs font-mono font-bold bg-surface-muted px-2 py-1 border border-foreground/20 w-fit">
                  {displayReference}
                </span>
              )}
              <span className="text-[10px] font-black uppercase tracking-widest px-2 py-1 w-fit border border-foreground/20 bg-accent-pink/10 text-accent-pink">
                {liveClaim?.status === "pending"
                  ? "Accept or Decline"
                  : liveClaim?.status === "approved"
                    ? "Matched"
                    : hero?.publicStatus
                      ? String(hero.publicStatus).replace(/_/g, " ")
                      : submission.status.replace(/_/g, " ")}
              </span>
              <h1 className="text-2xl sm:text-3xl font-display font-black uppercase tracking-tight leading-tight break-words">
                {hero?.title || "Your donation"}
              </h1>
              {hero &&
                String(hero.publicStatus || "") !== "withdrawn" &&
                !["being_matched", "claimed", "reloved"].includes(String(hero.publicStatus || "")) &&
                liveClaim?.status !== "pending" &&
                liveClaim?.status !== "approved" && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => beginEditItem(hero)}
                  className="w-full sm:w-fit mt-1 tracking-wide"
                >
                  Edit item details
                </Button>
              )}
            </div>
          </div>

          {editingItemId && hero && editingItemId === hero.id && (
            <div className="flex flex-col gap-3 p-4 border-2 border-foreground bg-white shadow-[4px_4px_0px_rgba(0,0,0,1)]">
              <p className="text-sm font-black uppercase tracking-widest">Edit item</p>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold uppercase tracking-widest">Title *</label>
                <Input
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  className="rounded-none border-2 border-foreground"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-widest">Category</label>
                  <select
                    value={editForm.category}
                    onChange={(e) => setEditForm({ ...editForm, category: e.target.value, size: "" })}
                    className="flex h-10 w-full bg-background px-3 py-2 text-sm rounded-none border-2 border-foreground"
                  >
                    {DROP_CATEGORY_OPTIONS.map(({ label, value }) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-widest">For</label>
                  <select
                    value={editForm.gender}
                    onChange={(e) => setEditForm({ ...editForm, gender: e.target.value, size: "" })}
                    className="flex h-10 w-full bg-background px-3 py-2 text-sm rounded-none border-2 border-foreground"
                  >
                    {DROP_GENDER_OPTIONS.map(({ label, value }) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-widest">Condition</label>
                  <select
                    value={editForm.condition}
                    onChange={(e) => setEditForm({ ...editForm, condition: e.target.value })}
                    className="flex h-10 w-full bg-background px-3 py-2 text-sm rounded-none border-2 border-foreground"
                  >
                    <option value="Excellent">Excellent</option>
                    <option value="Good">Good</option>
                    <option value="Fair but fully usable">Fair but fully usable</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-widest">
                    {editForm.gender === "girls" || editForm.gender === "boys" ? "Age band *" : "Size *"}
                  </label>
                  {editForm.gender === "girls" || editForm.gender === "boys" ? (
                    <select
                      value={editForm.size}
                      onChange={(e) => setEditForm({ ...editForm, size: e.target.value })}
                      className="flex h-10 w-full bg-background px-3 py-2 text-sm rounded-none border-2 border-foreground"
                    >
                      <option value="">Select age band</option>
                      {KIDS_AGE_BANDS.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  ) : (SIZE_REQUIRED_CATEGORIES as readonly string[]).includes(
                      normalizeLaunchCategory(editForm.category),
                    ) ? (
                    <select
                      value={editForm.size}
                      onChange={(e) => setEditForm({ ...editForm, size: e.target.value })}
                      className="flex h-10 w-full bg-background px-3 py-2 text-sm rounded-none border-2 border-foreground"
                    >
                      <option value="">Select size</option>
                      {APPAREL_SIZES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      value={editForm.size}
                      onChange={(e) => setEditForm({ ...editForm, size: e.target.value })}
                      className="rounded-none border-2 border-foreground"
                      placeholder="Optional"
                    />
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-widest">Brand</label>
                  <Input
                    value={editForm.brand}
                    onChange={(e) => setEditForm({ ...editForm, brand: e.target.value })}
                    className="rounded-none border-2 border-foreground"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-widest">Quantity</label>
                  <Input
                    type="number"
                    min={1}
                    value={editForm.quantity}
                    onChange={(e) => setEditForm({ ...editForm, quantity: parseInt(e.target.value) || 1 })}
                    className="rounded-none border-2 border-foreground"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold uppercase tracking-widest">Description</label>
                <Textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className="rounded-none border-2 border-foreground h-24"
                />
              </div>
              {editError && (
                <p className="text-sm font-bold text-accent-red">{editError}</p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="cta"
                  className="font-black uppercase tracking-widest"
                  disabled={editSaving}
                  onClick={() => void saveEditItem()}
                >
                  {editSaving ? "Saving…" : "Save changes"}
                </Button>
                <Button
                  variant="outline"
                  className="font-black uppercase tracking-widest"
                  disabled={editSaving}
                  onClick={() => setEditingItemId(null)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {otherItems.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-bold text-foreground-muted">
                Other pieces from this drop (each is a separate wall listing — open one to manage its claim):
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {otherItems.map((item) => {
                  const qs = new URLSearchParams()
                  qs.set("item", item.id)
                  if (item.claim?.id) qs.set("claim", item.claim.id)
                  return (
                  <Link
                    key={item.id}
                    to={`/account/gifts/${submission.id}?${qs.toString()}`}
                    className="border-2 border-foreground bg-white overflow-hidden aspect-square block"
                  >
                    <SafeImage
                      src={resolveImageUrl(item.images?.[0]?.storagePath)}
                      alt={item.title}
                      className="w-full h-full object-contain"
                    />
                  </Link>
                  )
                })}
              </div>
            </div>
          )}

          {(approved || submission.status === "pending") && (
            <div className="flex flex-col gap-4 pt-2 border-t-2 border-foreground/10">
              {claimFocusMissing && (
                <p className="text-xs font-bold text-accent-red">
                  That claim link didn&apos;t match an item in this drop. Pick the piece below.
                </p>
              )}
              {(needsClaimPicker || claimFocusMissing) && allPendingItemClaims.length > 0 && (
                <div className="flex flex-col gap-3 p-3 sm:p-4 border-2 border-foreground bg-white">
                  <p className="text-sm font-bold">
                    {allPendingItemClaims.length} pieces have claim requests — open one at a time.
                  </p>
                  <p className="text-xs text-foreground-muted font-medium">
                    Accepting or declining only affects that specific item. Other pieces stay on the Wall.
                  </p>
                  <div className="flex flex-col gap-2">
                    {allPendingItemClaims.map(({ item, claim }) => (
                      <Link
                        key={claim.id}
                        to={`/account/gifts/${submission.id}?claim=${encodeURIComponent(claim.id)}`}
                        className="flex items-center gap-3 p-2 border-2 border-foreground hover:bg-accent-pink/10"
                      >
                        <div className="w-12 h-12 shrink-0 border border-foreground/20 overflow-hidden bg-white">
                          <SafeImage
                            src={resolveImageUrl(item.images?.[0]?.storagePath)}
                            alt={item.title}
                            className="w-full h-full object-contain"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold truncate">{item.title}</p>
                          <p className="text-[10px] font-black uppercase tracking-widest text-accent-pink">
                            Accept or Decline →
                          </p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              {pendingItemClaims.map(({ item, claim }) => {
                const claimLogistics = String(
                  claim.giverLogistics || submission.giverLogistics || item.giverLogistics || "",
                )
                const showDecline = declineOpen && declineClaimId === claim.id
                return (
                  <div
                    key={claim.id}
                    className="flex flex-col gap-3 p-3 sm:p-4 border-2 border-foreground min-w-0 overflow-hidden bg-accent-pink/10"
                  >
                    <p className="text-sm font-bold break-words">
                      Someone wants to Relove your {item.title || "item"} 💗
                    </p>
                    <p className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">
                      This decision is for this item only
                    </p>
                    {claim.requesterName && (
                      <p className="text-xs font-medium">From Receiver</p>
                    )}
                    <div className="flex flex-col sm:flex-row flex-wrap gap-2 w-full min-w-0">
                      <Button
                        type="button"
                        variant="cta"
                        disabled={busy}
                        onClick={() => giverDecision(claim.id, "accept")}
                        className="w-full sm:w-auto"
                      >
                        Accept
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          setDeclineClaimId(claim.id)
                          setDeclineOpen(true)
                        }}
                        className="w-full sm:w-auto"
                      >
                        Decline
                      </Button>
                    </div>
                    <p className="text-xs text-foreground-muted border-t border-foreground/15 pt-2">
                      {usesExternalCourier(claimLogistics) ? (
                        <>
                          After Accept: leave the bag at your building gate. Reloved books the courier when both of you
                          agree timing — your phone stays private.
                        </>
                      ) : claimLogistics === "receiver_collects" ? (
                        <>
                          After Accept: leave the bag at your building gate for the claimer to collect. No courier booking
                          needed — confirm timing in chat if you want.
                        </>
                      ) : claimLogistics === "personal_driver" || claimLogistics === "giver_sends" ? (
                        <>
                          After Accept: arrange handover your way (driver or self-send). Mark Handed over when the bag
                          leaves. No Reloved courier booking on this claim.
                        </>
                      ) : (
                        <>
                          After Accept: open this gift again for handover next steps that match how you chose to give.
                        </>
                      )}
                    </p>
                    {showDecline && (
                      <div className="flex flex-col gap-2 pt-2 border-t border-foreground/15 min-w-0">
                        <label className="text-[10px] font-black uppercase tracking-widest">
                          Why this match doesn&apos;t work for you
                        </label>
                        <p className="text-[11px] text-foreground-muted font-medium leading-relaxed">
                          You don&apos;t need to know the claimer. Pick a reason about distance, timing, or that
                          you&apos;re already matching someone else. They only see a soft “couldn&apos;t match” —
                          not your exact reason wording.
                        </p>
                        <select
                          value={declineReason}
                          onChange={(e) => setDeclineReason(e.target.value)}
                          className="h-11 w-full max-w-full bg-background px-3 text-sm font-medium border-2 border-foreground"
                        >
                          <option value="too_far">Too far / outside my handover zone</option>
                          <option value="timing">Timing doesn&apos;t work for me</option>
                          <option value="already_promised">Already matching someone else</option>
                          <option value="other">Other (prefer not to say)</option>
                        </select>
                        <div className="flex flex-col gap-2 w-full min-w-0">
                          <Button
                            type="button"
                            variant="outline"
                            disabled={busy}
                            onClick={() => {
                              setDeclineOpen(false)
                              setDeclineClaimId(null)
                            }}
                            className="w-full"
                          >
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            variant="cta"
                            disabled={busy}
                            onClick={() => giverDecision(claim.id, "decline", declineReason)}
                            className="w-full whitespace-normal leading-tight"
                          >
                            Confirm — couldn&apos;t match
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
              {liveClaim?.status === "approved" &&
                String(liveClaim.giverLogistics || logistics) === "porter_arranged" && (
                <div className="flex flex-col gap-3 min-w-0">
                  <ScheduleHandoverPanel
                    role="giver"
                    claim={{
                      id: liveClaim.id,
                      status: liveClaim.status,
                      handoverStage: liveClaim.handoverStage,
                      giverLogistics: liveClaim.giverLogistics || logistics,
                      pickupLocality: hero?.locality || submission.locality || submission.address,
                      requesterAddress: liveClaim.requesterAddress,
                      pickupAddressConfirmedByGiver: liveClaim.pickupAddressConfirmedByGiver,
                      dropAddressConfirmedByClaimer: liveClaim.dropAddressConfirmedByClaimer,
                      proposedSlotAt: liveClaim.proposedSlotAt,
                      proposedSlotBy: liveClaim.proposedSlotBy,
                      proposedSlots: liveClaim.proposedSlots,
                      scheduleMode: liveClaim.scheduleMode,
                      agreedSlotAt: liveClaim.agreedSlotAt,
                      opsBookingStatus: liveClaim.opsBookingStatus,
                    }}
                    pickupHint={hero?.locality || submission.locality || submission.address}
                    onUpdated={() => reload()}
                    onError={(message) => setNotice({ title: "Couldn't update", body: message, tone: "error" })}
                  />
                  <div className="flex flex-wrap gap-2">
                    {/* Open Shiprocket / Shadowfax removed from giver UI — Reloved ops books. */}
                  </div>
                  {scheduleAllowsHandedOver({
                    id: liveClaim.id,
                    status: liveClaim.status,
                    handoverStage: liveClaim.handoverStage,
                    giverLogistics: liveClaim.giverLogistics || logistics,
                    opsBookingStatus: liveClaim.opsBookingStatus,
                    agreedSlotAt: liveClaim.agreedSlotAt,
                  }) &&
                    liveClaim.handoverStage !== "handed_over" &&
                    liveClaim.handoverStage !== "received" && (
                    <Button type="button" variant="cta" disabled={busy} onClick={markHandedOver}>
                      Handed over
                    </Button>
                  )}
                  {liveClaim.handoverStage === "handed_over" && (
                    <p className="text-sm font-bold">Waiting for the receiver to confirm Received.</p>
                  )}
                  {liveClaim.handoverStage === "received" && (
                    <p className="text-sm font-black uppercase tracking-widest text-accent-pink">RELOVED ❤️</p>
                  )}
                </div>
              )}
              {liveClaim?.status === "approved" &&
                String(liveClaim.giverLogistics || logistics) !== "porter_arranged" && (
                <div className="flex flex-col gap-3 p-4 border-2 border-foreground bg-accent-green/15">
                  <p className="text-[10px] font-black uppercase tracking-widest">Matched</p>
                  {liveClaim.addressSaved || liveClaim.requesterAddress ? (
                    <p className="text-sm font-bold">Delivery area ready (exact flat hidden).</p>
                  ) : (
                    <p className="text-sm font-medium">Waiting for the receiver to save a delivery building.</p>
                  )}

                  {(liveClaim.requesterName || liveClaim.requesterPhone || liveClaim.requesterAddress) && (
                    <div className="flex flex-col gap-2 p-3 bg-white border-2 border-foreground text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">
                          Claimer details (tap to copy)
                        </p>
                        <button
                          type="button"
                          className="text-[10px] font-black uppercase tracking-widest underline"
                          onClick={() => void copyAllClaimerDetails()}
                        >
                          {copiedField === "all" ? "Copied all" : "Copy all"}
                        </button>
                      </div>
                      {liveClaim.requesterName && (
                        <button
                          type="button"
                          className="flex items-start justify-between gap-2 text-left w-full group"
                          onClick={() => void copyText("name", liveClaim.requesterName || "")}
                        >
                          <span>
                            <span className="text-[10px] font-black uppercase tracking-widest text-foreground-muted block">Name</span>
                            <span className="font-bold">{liveClaim.requesterName}</span>
                          </span>
                          {copiedField === "name" ? <Check size={14} className="shrink-0 mt-1" /> : <Copy size={14} className="shrink-0 mt-1 opacity-50 group-hover:opacity-100" />}
                        </button>
                      )}
                      {liveClaim.requesterAddress && (
                        <button
                          type="button"
                          className="flex items-start justify-between gap-2 text-left w-full group"
                          onClick={() => void copyText("address", liveClaim.requesterAddress || "")}
                        >
                          <span>
                            <span className="text-[10px] font-black uppercase tracking-widest text-foreground-muted block">Address</span>
                            <span className="font-medium">{liveClaim.requesterAddress}</span>
                          </span>
                          {copiedField === "address" ? <Check size={14} className="shrink-0 mt-1" /> : <Copy size={14} className="shrink-0 mt-1 opacity-50 group-hover:opacity-100" />}
                        </button>
                      )}
                      {liveClaim.requesterPhone && (
                        <button
                          type="button"
                          className="flex items-start justify-between gap-2 text-left w-full group"
                          onClick={() => void copyText("phone", liveClaim.requesterPhone || "")}
                        >
                          <span>
                            <span className="text-[10px] font-black uppercase tracking-widest text-foreground-muted block">Phone</span>
                            <span className="font-bold">{liveClaim.requesterPhone}</span>
                          </span>
                          {copiedField === "phone" ? <Check size={14} className="shrink-0 mt-1" /> : <Copy size={14} className="shrink-0 mt-1 opacity-50 group-hover:opacity-100" />}
                        </button>
                      )}
                      <p className="text-[10px] text-foreground-muted">
                        {isPersonalDriver
                          ? "Share with your personal driver. Prefer gate / landmark — not flat number on the rider note."
                          : "Fallback: paste into Shiprocket or share with a delivery partner. Prefer gate / landmark — not flat number on the rider note."}
                      </p>
                    </div>
                  )}

                  {(isPersonalDriver ||
                    logistics === "giver_sends" ||
                    logistics === "receiver_collects" ||
                    !usesExternalCourier(logistics)) && (
                  <p className="text-[11px] text-foreground-muted font-medium">
                    {isPersonalDriver || logistics === "giver_sends"
                      ? "You handle delivery. Mark handed over when the bag leaves."
                      : logistics === "receiver_collects"
                        ? "Claimer collects from your gate. Mark handed over when they’ve picked up."
                        : "Follow the handover steps for how you chose to give. Mark handed over when the bag leaves."}
                  </p>
                  )}
                  {liveClaim.handoverStage !== "handed_over" && liveClaim.handoverStage !== "received" && (
                    <Button
                      type="button"
                      variant="cta"
                      disabled={busy}
                      onClick={markHandedOver}
                    >
                      Handed over
                    </Button>
                  )}
                  {liveClaim.handoverStage === "handed_over" && (
                    <p className="text-sm font-bold">Waiting for the receiver to confirm Received.</p>
                  )}
                  {liveClaim.handoverStage === "received" && (
                    <p className="text-sm font-black uppercase tracking-widest text-accent-pink">RELOVED ❤️</p>
                  )}
                </div>
              )}
              {!approved && (
                <p className="text-sm text-foreground-muted font-medium">
                  Under review. You can message Reloved below anytime.
                </p>
              )}
              {approved && !liveClaim && !needsClaimPicker && allPendingItemClaims.length === 0 && (
                <p className="text-sm text-foreground-muted font-medium">
                  Live on the Wall — you'll see requests here as they come in.
                </p>
              )}
              {/* Multi-item drops: only remove THIS piece from the Wall, not the whole bag. */}
              {hero &&
                (submission.status === "pending" ||
                  submission.status === "pending_review" ||
                  submission.status === "submitted" ||
                  submission.status === "under_review" ||
                  submission.status === "rejected" ||
                  (approved &&
                    !liveClaim &&
                    !["being_matched", "claimed", "reloved"].includes(String(hero.publicStatus || "")))) && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    if ((submission.items?.length || 0) > 1 && hero) {
                      void setItemOffWall(hero.id)
                    } else {
                      removeListing()
                    }
                  }}
                >
                  {approved
                    ? (submission.items?.length || 0) > 1
                      ? "Remove this item from Wall"
                      : "Remove from Wall"
                    : "Remove listing"}
                </Button>
              )}
              <DualChatOptions
                relovedType="donation"
                relovedSubjectId={submission.id}
                peerClaimId={liveClaim?.id}
                peerEnabled={liveClaim?.status === "approved"}
                peerLabel="Chat with receiver"
              />
            </div>
          )}

          {submission.status === "rejected" && (
            <p className="text-sm text-foreground-muted font-medium border-2 border-foreground bg-surface-muted px-3 py-2.5">
              This drop didn&apos;t go live on the Wall. You can drop again anytime with clearer photos or details — Reloved is happy to help.
            </p>
          )}
        </div>
      </div>

      {notice && (
        <NoticeModal
          title={notice.title}
          body={notice.body}
          tone={notice.tone}
          primaryLabel={notice.primaryLabel}
          onPrimary={notice.onPrimary}
          secondaryLabel={notice.secondaryLabel}
          onSecondary={notice.onSecondary}
          promptLabel={notice.promptLabel}
          promptPlaceholder={notice.promptPlaceholder}
          promptRequired={notice.promptRequired}
          onClose={() => setNotice(null)}
        />
      )}
    </div>
  )
}
