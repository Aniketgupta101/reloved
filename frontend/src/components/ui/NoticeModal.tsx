import { X } from "lucide-react"
import { Button } from "@/components/ui/Button"

type NoticeModalProps = {
  title: string
  body: string
  onClose: () => void
  /** Primary action — defaults to Close */
  primaryLabel?: string
  onPrimary?: () => void
  secondaryLabel?: string
  onSecondary?: () => void
  tone?: "ok" | "warn" | "error"
}

/** In-app popup (replaces window.alert / confirm chrome dialogs). */
export function NoticeModal({
  title,
  body,
  onClose,
  primaryLabel = "Close",
  onPrimary,
  secondaryLabel,
  onSecondary,
  tone = "ok",
}: NoticeModalProps) {
  const toneBg =
    tone === "error" ? "bg-accent-pink/20" : tone === "warn" ? "bg-accent-pink/15" : "bg-accent-green"

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="notice-modal-title"
        className="bg-white border-2 border-foreground max-w-md w-full p-6 sm:p-8 shadow-[12px_12px_0px_rgba(0,0,0,1)] relative flex flex-col gap-4"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 p-2 bg-surface-muted border-2 border-foreground shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]"
          aria-label="Close"
        >
          <X size={18} />
        </button>
        <div className={`w-12 h-12 border-2 border-foreground flex items-center justify-center ${toneBg}`}>
          <span className="font-display font-black text-lg">{tone === "error" ? "!" : "✓"}</span>
        </div>
        <h3 id="notice-modal-title" className="text-xl font-display font-black uppercase tracking-tight pr-8">
          {title}
        </h3>
        <p className="text-sm font-medium text-foreground/85 leading-relaxed whitespace-pre-line">{body}</p>
        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          {secondaryLabel && onSecondary && (
            <Button type="button" variant="outline" className="flex-1 font-black uppercase tracking-widest" onClick={onSecondary}>
              {secondaryLabel}
            </Button>
          )}
          <Button
            type="button"
            variant="cta"
            className="flex-1 font-black uppercase tracking-widest"
            onClick={() => {
              onPrimary?.()
              onClose()
            }}
          >
            {primaryLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
