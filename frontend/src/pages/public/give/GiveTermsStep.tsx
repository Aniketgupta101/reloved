import { motion } from "motion/react"
import { LegalAccept } from "@/components/ui/LegalAccept"
import { giverLogisticsLabel } from "@shared/taxonomy"
import { useGiveFlow } from "./giveFlow"
export function GiveTermsStep() {
  const {
    setStep,
    photoItems,
    formData,
    setFormData,
  } = useGiveFlow()
  return (
    <motion.div key="step7" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col gap-6 flex-1">
      <div>
        <h2 className="text-3xl font-display font-bold uppercase mb-2">Terms &amp; submit</h2>
        <p className="text-foreground-muted">Accept Terms, then submit your drop. Check Your Drops for its current status.</p>
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
  )
}
