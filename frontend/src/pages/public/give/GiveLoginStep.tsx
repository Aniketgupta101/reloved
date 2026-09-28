import { motion } from "motion/react"
import { useGiveFlow } from "./giveFlow"
export function GiveLoginStep() {
  const {
    photoItems,
    formData,
  } = useGiveFlow()
  return (
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
  )
}
