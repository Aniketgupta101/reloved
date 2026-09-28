import { motion } from "motion/react"
import { PrivacyBuildingNotice } from "@/components/ui/PrivacyBuildingNotice"
import { useGiveFlow } from "./giveFlow"
export function GiveRecognitionStep() {
  const {
    formData,
    setFormData,
    profileUsername,
  } = useGiveFlow()
  return (
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
  )
}
