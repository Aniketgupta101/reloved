import { motion } from "motion/react"
import { Input } from "@/components/ui/Input"
import { AddressAutocomplete } from "@/components/ui/AddressAutocomplete"
import { Textarea } from "@/components/ui/Textarea"
import { UserCheck } from "lucide-react"
import { lookupLocalities } from "@/lib/mumbaiPincodes"
import { PrivacyBuildingNotice, privacyAddressWarning } from "@/components/ui/PrivacyBuildingNotice"
import { extractIndiaPincode, withIndiaPincode } from "@/lib/logisticsLinks"
import { GIVER_LOGISTICS_LABELS, GIVER_LOGISTICS_PICK_OPTIONS, type GiverLogistics } from "@shared/taxonomy"
import { DATE_RANGE_PRESETS, TIME_WINDOW_PRESETS } from "./model"
import { useGiveFlow } from "./giveFlow"
export function GiveHandoverStep() {
  const {
    formData,
    setFormData,
    hasSavedAddress,
    editingAddress,
    setEditingAddress,
  } = useGiveFlow()
  return (
    <motion.div key="step4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col gap-6 flex-1">
      <div>
        <h2 className="text-3xl font-display font-bold uppercase mb-2">How should this reach them?</h2>
        <p className="text-foreground-muted">Choose how you would like to hand over this item.</p>
      </div>

      <PrivacyBuildingNotice
        extraNote={
          <>
            Your item is submitted first. Check Your Drops for its current Wall status.
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
            You send it however you wish (yourself, a driver, or any courier you arrange). Receivers are matched within <span className="font-bold text-foreground">15 km</span> of your building. They share a delivery address only after you accept.
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
                placeholder="Search your building or landmark — used for 15 km matching"
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
  )
}
