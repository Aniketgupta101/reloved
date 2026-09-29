import { motion } from "motion/react"
import { AddressAutocomplete } from "@/components/ui/AddressAutocomplete"
import { Loader2 } from "lucide-react"
import { extractIndiaPincode, withIndiaPincode } from "@/lib/logisticsLinks"
import { PICKUP_LOCALITY_MAX, draftFromSuggestion } from "./model"
import { useGiveFlow } from "./giveFlow"
export function GiveReviewStep() {
  const {
    step,
    setStep,
    photoItems,
    itemDrafts,
    itemLabel,
    isMultiItem,
    uniqueGroups,
    setDetailGroupId,
    formData,
    setFormData,
    profileUsername,
    editingAddress,
    setEditingAddress,
    setSubmitFeedback,
  } = useGiveFlow()
  return (
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
              {!p.storagePath ? (
                <span className="absolute bottom-1 left-1 right-1 bg-black/80 text-white px-1 py-0.5 text-[9px] font-black uppercase text-center flex items-center justify-center gap-1">
                  <Loader2 className="w-2.5 h-2.5 animate-spin shrink-0" />
                  Saving photo…
                </span>
              ) : p.bgRemoved ? (
                <span className="absolute bottom-1 left-1 right-1 bg-accent-green/90 text-foreground border-t border-foreground px-1 py-0.5 text-[9px] font-black uppercase text-center">
                  Studio Cutout ✓
                </span>
              ) : !p.cutoutAttempted ? (
                <span className="absolute bottom-1 left-1 right-1 bg-black/80 text-white px-1 py-0.5 text-[9px] font-black uppercase text-center flex items-center justify-center gap-1">
                  <Loader2 className="w-2.5 h-2.5 animate-spin shrink-0" />
                  Polishing image…
                </span>
              ) : (
                <span className="absolute bottom-1 left-1 right-1 bg-surface-muted/90 text-foreground border-t border-foreground px-1 py-0.5 text-[9px] font-black uppercase text-center">
                  Original kept ✓
                </span>
              )}
            </div>
          ))}
        </div>
        {photoItems.some((p) => !p.storagePath) ? (
          <p className="text-xs font-bold flex items-center gap-2 border-2 border-foreground bg-accent-pink/15 px-3 py-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
            Saving photos — please wait a moment…
          </p>
        ) : photoItems.some((p) => !p.bgRemoved && !p.cutoutAttempted) ? (
          <p className="text-xs font-bold flex items-center justify-between border-2 border-foreground bg-accent-pink/15 px-3 py-2">
            <span className="flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              Studio polish running ({photoItems.filter((p) => p.bgRemoved).length} completed ✓, {photoItems.filter((p) => !p.bgRemoved && !p.cutoutAttempted).length} processing…)
            </span>
          </p>
        ) : null}

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
                          setSubmitFeedback(null)
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
                          setSubmitFeedback(null)
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
  )
}
