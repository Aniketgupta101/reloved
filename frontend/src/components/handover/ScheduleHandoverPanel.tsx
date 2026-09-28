import { useEffect, useMemo, useState } from "react"
import { isGatePickupLogistics, usesExternalCourier, usesHandoverSchedule } from "@shared/taxonomy"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { AddressAutocomplete } from "@/components/ui/AddressAutocomplete"
import { PrivacyBuildingNotice } from "@/components/ui/PrivacyBuildingNotice"
import { handoverStageLabel } from "@/lib/adminStatusLabels"

const MIN_LEAD_DAYS = 2
const TIME_OPTIONS = ["10:00", "12:00", "14:00", "16:00", "18:00", "20:00"] as const

export type ScheduleClaimFields = {
  id: string
  status: string
  handoverStage?: string | null
  giverLogistics?: string | null
  pickupLocality?: string | null
  requesterAddress?: string | null
  pickupAddressConfirmedByGiver?: boolean
  dropAddressConfirmedByClaimer?: boolean
  proposedSlotAt?: string | null
  proposedSlotBy?: string | null
  proposedSlots?: string[] | null
  scheduleMode?: string | null
  agreedSlotAt?: string | null
  opsBookingStatus?: string | null
}

type ProposeMode = "weekends" | "specific" | "custom"

function pad(n: number) {
  return String(n).padStart(2, "0")
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Earliest bookable calendar day (2 = ops buffer after claim). */
function minDate(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + MIN_LEAD_DAYS)
  return d
}

function combineDateAndTime(dateKey: string, timeHHMM: string): string {
  const [y, m, day] = dateKey.split("-").map(Number)
  const [hh, mm] = timeHHMM.split(":").map(Number)
  const d = new Date(y, m - 1, day, hh, mm, 0, 0)
  return d.toISOString()
}

function formatSlot(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
}

function formatDay(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })
}

function extractPincode(text: string): string {
  const m = String(text || "").match(/\b(\d{6})\b/)
  return m ? m[1] : ""
}

function nextWeekendKeys(count = 6): string[] {
  const out: string[] = []
  const start = minDate()
  const cursor = new Date(start)
  while (out.length < count) {
    const day = cursor.getDay()
    if (day === 0 || day === 6) out.push(toDateKey(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return out
}

function monthGrid(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1)
  const startPad = first.getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (Date | null)[] = []
  for (let i = 0; i < startPad; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d))
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

/**
 * Address confirm + delivery schedule negotiation for the manual ops-courier flow.
 * dropper proposes availability; claimer confirms presence or says unavailable.
 */
export function ScheduleHandoverPanel({
  claim,
  role,
  pickupHint,
  dropHint,
  onUpdated,
  onError,
}: {
  claim: ScheduleClaimFields
  role: "giver" | "claimer"
  pickupHint?: string | null
  dropHint?: string | null
  onUpdated: () => void | Promise<void>
  onError: (message: string) => void
}) {
  const logistics = String(claim.giverLogistics || "")
  const isCourier = usesExternalCourier(logistics)
  const isGatePickup = isGatePickupLogistics(logistics)
  const useSchedule =
    usesHandoverSchedule(logistics) || Boolean(claim.agreedSlotAt) || Boolean(claim.proposedSlotAt)
  const stage = String(claim.handoverStage || "")

  const seedAddress =
    role === "giver"
      ? String(pickupHint || claim.pickupLocality || "").trim()
      : String(dropHint || claim.requesterAddress || "").trim()

  const [accountAddress, setAccountAddress] = useState(seedAddress)
  const [address, setAddress] = useState(seedAddress)
  const [pincode, setPincode] = useState(extractPincode(seedAddress))
  const [busy, setBusy] = useState(false)
  const [loadingProfile, setLoadingProfile] = useState(false)

  const [mode, setMode] = useState<ProposeMode>("weekends")
  const [timeHHMM, setTimeHHMM] = useState<string>("18:00")
  const [weekendPick, setWeekendPick] = useState<string>(() => nextWeekendKeys(1)[0] || "")
  const [specificDate, setSpecificDate] = useState(() => toDateKey(minDate()))
  const [customDates, setCustomDates] = useState<string[]>([])
  const [calMonth, setCalMonth] = useState(() => {
    const d = minDate()
    return { y: d.getFullYear(), m: d.getMonth() }
  })
  const [note, setNote] = useState("")
  const [queryOpen, setQueryOpen] = useState(false)
  const [acceptPick, setAcceptPick] = useState<string>("")
  const [editingAvailability, setEditingAvailability] = useState(false)

  const offeredSlots = useMemo(() => {
    if (Array.isArray(claim.proposedSlots) && claim.proposedSlots.length) return claim.proposedSlots
    if (claim.proposedSlotAt) return [claim.proposedSlotAt]
    return []
  }, [claim.proposedSlots, claim.proposedSlotAt])

  useEffect(() => {
    if (offeredSlots[0]) setAcceptPick(offeredSlots[0])
  }, [offeredSlots])

  const canHandOver =
    stage === "schedule_agreed" ||
    stage === "awaiting_handover" ||
    claim.opsBookingStatus === "booked" ||
    claim.opsBookingStatus === "delivered"

  const statusLine = useMemo(() => handoverStageLabel(stage), [stage])
  const weekendOptions = useMemo(() => nextWeekendKeys(6), [])
  const minKey = toDateKey(minDate())

  const previewSlots = useMemo(() => {
    if (mode === "weekends") {
      if (!weekendPick) return []
      return [combineDateAndTime(weekendPick, timeHHMM)]
    }
    if (mode === "specific") {
      if (!specificDate) return []
      return [combineDateAndTime(specificDate, timeHHMM)]
    }
    return [...customDates].sort().map((dk) => combineDateAndTime(dk, timeHHMM))
  }, [mode, weekendPick, specificDate, customDates, timeHHMM])

  const headline = useMemo(() => {
    if (claim.agreedSlotAt) return `Booked for ${formatSlot(claim.agreedSlotAt)}`
    if (stage === "schedule_proposed" && offeredSlots.length === 1) {
      return `Shared: ${formatSlot(offeredSlots[0])}`
    }
    if (stage === "schedule_proposed" && offeredSlots.length > 1) {
      return `Shared ${offeredSlots.length} options · waiting on claimer`
    }
    return statusLine
  }, [claim.agreedSlotAt, stage, offeredSlots, statusLine])

  useEffect(() => {
    let cancelled = false
    async function loadProfile() {
      setLoadingProfile(true)
      try {
        const res = await api.donor.get<{ profile: { address?: string | null; addressLabel?: string | null } | null }>(
          "/api/donor/profile",
        )
        if (cancelled) return
        const saved = String(res.profile?.address || res.profile?.addressLabel || "").trim()
        if (saved) {
          setAccountAddress(saved)
          setAddress((prev) => {
            const p = prev.trim()
            if (!p || p.length < 8 || /^[a-z\s]+$/i.test(p)) return saved
            return p
          })
          const pin = extractPincode(saved)
          if (pin) setPincode((prev) => prev || pin)
        }
      } catch {
        /* non-fatal */
      } finally {
        if (!cancelled) setLoadingProfile(false)
      }
    }
    void loadProfile()
    return () => {
      cancelled = true
    }
  }, [])

  if (!useSchedule || claim.status !== "approved") return null

  async function confirmAddressOnly() {
    setBusy(true)
    try {
      await api.donor.post(`/api/donor/item-requests/${claim.id}/confirm-address`, {
        address: address.trim(),
        ...(pincode ? { pincode } : {}),
      })
      await onUpdated()
    } catch (err: any) {
      onError(err?.message || "Couldn't confirm address")
    } finally {
      setBusy(false)
    }
  }

  function buildSlotsFromUi(): string[] {
    if (mode === "weekends") {
      if (!weekendPick) return []
      return [combineDateAndTime(weekendPick, timeHHMM)]
    }
    if (mode === "specific") {
      if (!specificDate) return []
      return [combineDateAndTime(specificDate, timeHHMM)]
    }
    return [...customDates].sort().map((dk) => combineDateAndTime(dk, timeHHMM))
  }

  /** Dropper: save pickup address + preferred time in one Confirm (client flow). */
  async function confirmAddressAndShare() {
    const slots = buildSlotsFromUi()
    if (!slots.length) {
      onError(mode === "custom" ? "Tap dates on the calendar (you can pick more than one)." : "Pick a preferred date first.")
      return
    }
    if (!canConfirmAddress) {
      onError("Add your pickup building and 6-digit pincode.")
      return
    }
    setBusy(true)
    try {
      if (!claim.pickupAddressConfirmedByGiver) {
        await api.donor.post(`/api/donor/item-requests/${claim.id}/confirm-address`, {
          address: address.trim(),
          ...(pincode ? { pincode } : {}),
        })
      }
      await api.donor.post(`/api/donor/item-requests/${claim.id}/propose-schedule`, {
        slots,
        mode,
        note: note.trim() || undefined,
      })
      setNote("")
      setEditingAvailability(false)
      await onUpdated()
    } catch (err: any) {
      onError(err?.message || "Couldn't save address and preferred time")
    } finally {
      setBusy(false)
    }
  }

  async function propose() {
    const slots = buildSlotsFromUi()
    if (!slots.length) {
      onError(mode === "custom" ? "Tap dates on the calendar (you can pick more than one)." : "Pick a date first.")
      return
    }
    setBusy(true)
    try {
      await api.donor.post(`/api/donor/item-requests/${claim.id}/propose-schedule`, {
        slots,
        mode,
        note: note.trim() || undefined,
      })
      setNote("")
      setEditingAvailability(false)
      await onUpdated()
    } catch (err: any) {
      onError(err?.message || "Couldn't propose time")
    } finally {
      setBusy(false)
    }
  }

  async function acceptPresence() {
    setBusy(true)
    try {
      await api.donor.post(`/api/donor/item-requests/${claim.id}/respond-schedule`, {
        decision: "accept",
        slotAt: acceptPick || offeredSlots[0],
      })
      await onUpdated()
    } catch (err: any) {
      onError(err?.message || "Couldn't confirm")
    } finally {
      setBusy(false)
    }
  }

  async function sayUnavailable() {
    setBusy(true)
    try {
      await api.donor.post(`/api/donor/item-requests/${claim.id}/respond-schedule`, {
        decision: "unavailable",
        note: note.trim() || undefined,
      })
      setNote("")
      setQueryOpen(false)
      await onUpdated()
    } catch (err: any) {
      onError(err?.message || "Couldn't send")
    } finally {
      setBusy(false)
    }
  }

  function toggleCustomDate(key: string) {
    if (key < minKey) return
    setCustomDates((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key].sort()))
  }

  const myConfirmed =
    role === "giver"
      ? claim.pickupAddressConfirmedByGiver
      : isGatePickup
        ? true
        : claim.dropAddressConfirmedByClaimer
  const pinOk = pincode.length === 6 || Boolean(extractPincode(address))
  const canConfirmAddress = address.trim().length >= 4 && pinOk && !busy

  // Dropper shares preferred time as soon as *their* pickup address is ready — don’t wait on claimer.
  const giverNeedsInitialConfirm =
    role === "giver" && !claim.agreedSlotAt && (!claim.pickupAddressConfirmedByGiver || editingAvailability || !claim.proposedSlotAt)
  const giverCanPropose =
    role === "giver" &&
    Boolean(claim.pickupAddressConfirmedByGiver) &&
    !claim.agreedSlotAt &&
    (stage === "awaiting_schedule" ||
      stage === "awaiting_address_confirm" ||
      !claim.proposedSlotAt ||
      editingAvailability)
  const giverWaitingOnClaimer =
    role === "giver" &&
    stage === "schedule_proposed" &&
    Boolean(claim.proposedSlotAt) &&
    !editingAvailability
  const claimerWaitingOnGiver =
    role === "claimer" &&
    myConfirmed &&
    !claim.agreedSlotAt &&
    stage !== "schedule_proposed"
  const claimerRespond =
    role === "claimer" &&
    myConfirmed &&
    stage === "schedule_proposed" &&
    offeredSlots.length > 0
  const showGiverAddressAndTime = role === "giver" && (giverNeedsInitialConfirm || giverCanPropose) && !giverWaitingOnClaimer
  const showClaimerAddress = role === "claimer" && !myConfirmed && !isGatePickup

  const cells = monthGrid(calMonth.y, calMonth.m)
  const monthLabel = new Date(calMonth.y, calMonth.m, 1).toLocaleString("en-IN", {
    month: "long",
    year: "numeric",
  })

  return (
    <div className="flex flex-col gap-3 p-3 sm:p-4 border border-foreground sm:border-2 bg-accent-green/15 min-w-0 overflow-x-hidden box-border">
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest">Matched · delivery</p>
        <p className="text-sm font-bold mt-0.5 text-pretty break-words">{headline}</p>
        {(claim.agreedSlotAt || (stage === "schedule_proposed" && offeredSlots.length > 0)) && (
          <div className="mt-2 p-3 border border-foreground sm:border-2 bg-white min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">
              {claim.agreedSlotAt ? "Delivery time" : "Availability shared"}
            </p>
            {claim.agreedSlotAt ? (
              <p className="text-base sm:text-lg font-display font-black mt-1 break-words">{formatSlot(claim.agreedSlotAt)}</p>
            ) : (
              <ul className="mt-1 space-y-1 text-sm font-bold break-words">
                {offeredSlots.map((s) => (
                  <li key={s}>{formatSlot(s)}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        <p className="text-xs text-foreground-muted mt-2 leading-relaxed text-pretty">
          {role === "giver" ? (
            isGatePickup ? (
              <>
                After Accept: confirm your <strong>gate / building</strong> and <strong>preferred pickup time</strong>,
                then Confirm. The claimer confirms they’ll collect — no Reloved courier.
              </>
            ) : isCourier ? (
              <>
                After Accept: enter your <strong>pickup address</strong> and <strong>preferred time</strong> here, then
                Confirm. The claimer confirms their building next — Reloved coordinates delivery. No extra emails.
              </>
            ) : (
              <>
                After Accept: confirm your <strong>pickup / send address</strong> and <strong>preferred time</strong>,
                then Confirm. The claimer confirms presence — you handle the delivery yourself.
              </>
            )
          ) : isGatePickup ? (
            <>
              Confirm a pickup time at the dropper’s building gate. No courier — collect in a bag from security.
            </>
          ) : isCourier ? (
            <>
              Confirm your delivery building. When the dropper shares a preferred time, confirm you’ll be present —
              Reloved books the courier.
            </>
          ) : (
            <>
              Confirm your delivery building if needed. When the dropper shares a time, confirm you’ll be present.
            </>
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs min-w-0">
        <div className="border border-foreground sm:border-2 bg-white p-2 min-w-0">
          <p className="font-black uppercase tracking-widest text-[10px] text-foreground-muted">Pickup</p>
          <p className="font-medium mt-1 break-words">{claim.pickupLocality || pickupHint || "—"}</p>
          <p className="mt-1 font-bold">
            {claim.pickupAddressConfirmedByGiver ? "Confirmed by dropper" : "Waiting on dropper"}
          </p>
        </div>
        <div className="border border-foreground sm:border-2 bg-white p-2 min-w-0">
          <p className="font-black uppercase tracking-widest text-[10px] text-foreground-muted">
            {isGatePickup ? "Pickup gate" : "Drop"}
          </p>
          <p className="font-medium mt-1 break-words">
            {isGatePickup
              ? claim.pickupLocality || pickupHint || "Dropper’s building gate"
              : role === "claimer"
                ? claim.requesterAddress || dropHint || "—"
                : claim.dropAddressConfirmedByClaimer
                  ? "Confirmed (details private)"
                  : "Waiting on claimer"}
          </p>
          <p className="mt-1 font-bold">
            {isGatePickup
              ? claim.pickupAddressConfirmedByGiver
                ? "Gate shared by dropper"
                : "Waiting on dropper"
              : claim.dropAddressConfirmedByClaimer
                ? "Confirmed by claimer"
                : "Waiting on claimer"}
          </p>
        </div>
      </div>

      {/* Claimer: address only (until dropper shares time) — skip for gate pickup */}
      {showClaimerAddress && (
        <div className="flex flex-col gap-2 border-t-2 border-foreground/10 pt-3">
          <label className="text-[10px] font-black uppercase tracking-widest">Your delivery address</label>
          {accountAddress && (
            <p className="text-xs font-medium text-foreground leading-snug break-words">
              On your profile: <span className="font-bold">{accountAddress}</span>
              {loadingProfile ? " …" : ""}
            </p>
          )}
          <PrivacyBuildingNotice className="text-xs" />
          <AddressAutocomplete
            value={address}
            onChange={setAddress}
            onSelect={(val, _coords, postcode) => {
              setAddress(val)
              if (postcode) {
                const pin = String(postcode).replace(/\D/g, "").slice(0, 6)
                if (pin.length === 6) setPincode(pin)
              } else {
                const pin = extractPincode(val)
                if (pin) setPincode(pin)
              }
            }}
            placeholder="Building name, street/landmark, area"
            className="rounded-none border-2 border-foreground"
          />
          <p className="text-[11px] text-foreground-muted leading-snug">
            Building name + street/area + pincode so the courier can find the gate. No flat or wing numbers.
          </p>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">Pincode *</label>
            <Input
              inputMode="numeric"
              maxLength={6}
              value={pincode}
              onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="e.g. 400053"
              className="rounded-none border-2 border-foreground h-11"
            />
          </div>
          <Button type="button" variant="cta" disabled={!canConfirmAddress} onClick={() => void confirmAddressOnly()} className="w-full">
            {busy ? "Saving…" : "Confirm address"}
          </Button>
        </div>
      )}

      {/* Claimer: wait until dropper proposes */}
      {claimerWaitingOnGiver && (
        <div className="border-t-2 border-foreground/10 pt-3">
          <p className="text-sm font-bold">Waiting for the dropper to share when they’re free.</p>
          <p className="text-xs text-foreground-muted mt-1">
            You’ll get a time here — then confirm you’ll be present at the drop building.
          </p>
        </div>
      )}

      {/* Dropper: address + preferred time together → one Confirm */}
      {showGiverAddressAndTime && (
        <div className="flex flex-col gap-3 border-t-2 border-foreground/10 pt-3">
          {editingAvailability && stage === "schedule_proposed" && (
            <button
              type="button"
              className="text-[10px] font-black uppercase tracking-widest underline text-left w-fit"
              onClick={() => setEditingAvailability(false)}
            >
              Cancel edit
            </button>
          )}

          {!claim.pickupAddressConfirmedByGiver && (
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-black uppercase tracking-widest">Your pickup address</label>
              {accountAddress && (
                <p className="text-xs font-medium text-foreground leading-snug break-words">
                  On your profile: <span className="font-bold">{accountAddress}</span>
                  {loadingProfile ? " …" : ""}
                </p>
              )}
              <PrivacyBuildingNotice className="text-xs" />
              <AddressAutocomplete
                value={address}
                onChange={setAddress}
                onSelect={(val, _coords, postcode) => {
                  setAddress(val)
                  if (postcode) {
                    const pin = String(postcode).replace(/\D/g, "").slice(0, 6)
                    if (pin.length === 6) setPincode(pin)
                  } else {
                    const pin = extractPincode(val)
                    if (pin) setPincode(pin)
                  }
                }}
                placeholder="Building name, street/landmark, area"
                className="rounded-none border-2 border-foreground"
              />
              <p className="text-[11px] text-foreground-muted leading-snug">
                Building name + street/area + pincode. No flat or wing numbers.
              </p>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">Pincode *</label>
                <Input
                  inputMode="numeric"
                  maxLength={6}
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="e.g. 400053"
                  className="rounded-none border-2 border-foreground h-11"
                />
              </div>
            </div>
          )}

          <p className="text-[10px] font-black uppercase tracking-widest">Preferred pickup time</p>

          <div className="flex flex-wrap gap-2">
            {(
              [
                ["weekends", "Weekends only"],
                ["specific", "Specific date"],
                ["custom", "Custom (multi-date)"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                className={`px-3 py-2 border-2 border-foreground text-[10px] font-black uppercase tracking-widest ${
                  mode === id ? "bg-foreground text-background" : "bg-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">
              Preferred time
            </label>
            <div className="flex flex-wrap gap-2">
              {TIME_OPTIONS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTimeHHMM(t)}
                  className={`px-2.5 py-1.5 border-2 border-foreground text-xs font-bold ${
                    timeHHMM === t ? "bg-accent-green" : "bg-white"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {mode === "weekends" && (
            <div className="flex flex-col gap-2">
              <p className="text-[11px] text-foreground-muted">Tap a weekend (Sat / Sun) from tomorrow onward.</p>
              <div className="flex flex-wrap gap-2">
                {weekendOptions.map((dk) => {
                  const d = new Date(dk + "T12:00:00")
                  const label = d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })
                  return (
                    <button
                      key={dk}
                      type="button"
                      onClick={() => setWeekendPick(dk)}
                      className={`px-3 py-2 border-2 border-foreground text-xs font-bold ${
                        weekendPick === dk ? "bg-accent-green" : "bg-white"
                      }`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {mode === "specific" && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">Date</label>
              <input
                type="date"
                min={minKey}
                value={specificDate}
                onChange={(e) => setSpecificDate(e.target.value)}
                className="h-11 w-full border-2 border-foreground bg-background px-3 text-sm font-medium"
              />
            </div>
          )}

          {mode === "custom" && (
            <div className="flex flex-col gap-2 border-2 border-foreground bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  className="text-xs font-black uppercase tracking-widest underline"
                  onClick={() =>
                    setCalMonth((c) => {
                      const d = new Date(c.y, c.m - 1, 1)
                      return { y: d.getFullYear(), m: d.getMonth() }
                    })
                  }
                >
                  Prev
                </button>
                <p className="text-xs font-black uppercase tracking-widest">{monthLabel}</p>
                <button
                  type="button"
                  className="text-xs font-black uppercase tracking-widest underline"
                  onClick={() =>
                    setCalMonth((c) => {
                      const d = new Date(c.y, c.m + 1, 1)
                      return { y: d.getFullYear(), m: d.getMonth() }
                    })
                  }
                >
                  Next
                </button>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-black uppercase tracking-widest text-foreground-muted">
                {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {cells.map((cell, i) => {
                  if (!cell) return <span key={`e-${i}`} />
                  const key = toDateKey(cell)
                  const disabled = key < minKey
                  const selected = customDates.includes(key)
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={disabled}
                      onClick={() => toggleCustomDate(key)}
                      className={`h-9 text-xs font-bold border border-foreground/20 ${
                        disabled
                          ? "opacity-30 cursor-not-allowed"
                          : selected
                            ? "bg-accent-green border-foreground"
                            : "bg-white hover:bg-[#F7F5F0]"
                      }`}
                    >
                      {cell.getDate()}
                    </button>
                  )
                })}
              </div>
              <p className="text-[11px] text-foreground-muted">
                Selected: {customDates.length ? customDates.map((dk) => formatDay(dk + "T12:00:00")).join(", ") : "none yet"}
              </p>
            </div>
          )}

          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note (gate / landmark tip)"
            className="rounded-none border-2 border-foreground"
          />
          {previewSlots.length > 0 && (
            <div className="p-3 border-2 border-foreground bg-white">
              <p className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">
                You’ll share with claimer
              </p>
              <ul className="mt-1 space-y-1">
                {previewSlots.map((s) => (
                  <li key={s} className="text-base font-display font-black">
                    {formatSlot(s)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Button
            type="button"
            variant="cta"
            disabled={
              busy ||
              previewSlots.length < 1 ||
              (!claim.pickupAddressConfirmedByGiver && !canConfirmAddress)
            }
            onClick={() =>
              void (claim.pickupAddressConfirmedByGiver ? propose() : confirmAddressAndShare())
            }
            className="w-full max-w-full text-[11px] sm:text-xs tracking-wide"
          >
            {busy ? "Saving…" : claim.pickupAddressConfirmedByGiver ? "Share preferred time" : "Confirm · address + preferred time"}
          </Button>
        </div>
      )}

      {giverWaitingOnClaimer && (
        <div className="border-t-2 border-foreground/10 pt-3 flex flex-col gap-2">
          <p className="text-sm font-bold">Waiting for the claimer to confirm they’ll be present.</p>
          <ul className="text-sm font-medium space-y-1">
            {offeredSlots.map((s) => (
              <li key={s}>· {formatSlot(s)}</li>
            ))}
          </ul>
          <Button type="button" variant="outline" disabled={busy} onClick={() => setEditingAvailability(true)} className="w-full">
            Change my availability
          </Button>
        </div>
      )}

      {/* Claimer responds */}
      {claimerRespond && (
        <div className="flex flex-col gap-3 border-t-2 border-foreground/10 pt-3">
          <p className="text-sm font-bold leading-snug">
            the dropper is available on the time{offeredSlots.length > 1 ? "s" : ""} below. We need you present at your
            delivery building then.
          </p>
          {offeredSlots.length === 1 ? (
            <p className="text-lg font-display font-black">{formatSlot(offeredSlots[0])}</p>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">
                Pick the date that works
              </p>
              {offeredSlots.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setAcceptPick(s)}
                  className={`text-left px-3 py-2 border-2 border-foreground text-sm font-bold ${
                    acceptPick === s ? "bg-accent-green" : "bg-white"
                  }`}
                >
                  {formatSlot(s)}
                </button>
              ))}
            </div>
          )}
          <Button type="button" variant="cta" disabled={busy || !acceptPick} onClick={() => void acceptPresence()} className="w-full">
            {busy ? "Saving…" : "I’ll be there"}
          </Button>
          {!queryOpen ? (
            <Button type="button" variant="outline" disabled={busy} onClick={() => setQueryOpen(true)} className="w-full">
              Not free / have a query
            </Button>
          ) : (
            <div className="flex flex-col gap-2 p-3 border border-foreground sm:border-2 bg-white min-w-0">
              <label className="text-[10px] font-black uppercase tracking-widest">Tell the dropper</label>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Out of town that weekend — evenings next week work"
                className="rounded-none border border-foreground sm:border-2"
              />
              <div className="flex flex-col gap-2 min-w-0">
                <Button type="button" variant="cta" disabled={busy} onClick={() => void sayUnavailable()} className="w-full">
                  {busy ? "Sending…" : "Send to dropper"}
                </Button>
                <Button type="button" variant="outline" disabled={busy} onClick={() => setQueryOpen(false)} className="w-full">
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {claim.agreedSlotAt && (
        <div className="border-t-2 border-foreground/10 pt-3">
          <p className="text-sm font-black uppercase tracking-widest text-accent-pink">Agreed time</p>
          <p className="text-lg font-display font-black mt-1">{formatSlot(claim.agreedSlotAt)}</p>
          <p className="text-xs text-foreground-muted mt-1">
            {isCourier
              ? "Reloved will book the courier. You’ll get an update here when it’s booked."
              : isGatePickup
                ? "Claimer collects from your building gate at this time. Mark Handed over when they’ve picked up."
                : "You’ll hand over at this time your way. Mark Handed over when the bag leaves."}
          </p>
          {role === "giver" && canHandOver && (
            <p className="text-xs font-bold mt-2">
              {isCourier
                ? "When the bag leaves with the rider, tap Handed over below."
                : isGatePickup
                  ? "When they’ve collected from the gate, tap Handed over below."
                  : "When the bag has left, tap Handed over below."}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export function scheduleAllowsHandedOver(claim: ScheduleClaimFields | null | undefined): boolean {
  if (!claim) return false
  const stage = String(claim.handoverStage || "")
  const logistics = String(claim.giverLogistics || "")
  const scheduleOk =
    Boolean(claim.agreedSlotAt) || stage === "schedule_agreed" || stage === "awaiting_handover"

  if (logistics === "porter_arranged") {
    const addressesOk =
      Boolean(claim.pickupAddressConfirmedByGiver) && Boolean(claim.dropAddressConfirmedByClaimer)
    return (
      addressesOk &&
      scheduleOk &&
      (stage === "schedule_agreed" ||
        stage === "awaiting_handover" ||
        claim.opsBookingStatus === "booked" ||
        claim.opsBookingStatus === "delivered")
    )
  }

  if (usesHandoverSchedule(logistics)) {
    return scheduleOk
  }

  return stage !== "awaiting_delivery_address"
}
