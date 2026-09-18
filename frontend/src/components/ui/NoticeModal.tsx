import { useState } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/Button"

export type NoticeTone = "ok" | "warn" | "error"

export type NoticeState = {
  title: string
  body: string
  tone?: NoticeTone
  primaryLabel?: string
  onPrimary?: (promptValue?: string) => void
  secondaryLabel?: string
  onSecondary?: () => void
  /** When set, shows a text field (replaces window.prompt). */
  promptLabel?: string
  promptPlaceholder?: string
  promptRequired?: boolean
}

type NoticeModalProps = NoticeState & {
  onClose: () => void
}

/** In-app popup — never use window.alert / confirm / prompt. */
export function NoticeModal({
  title,
  body,
  onClose,
  primaryLabel = "Close",
  onPrimary,
  secondaryLabel,
  onSecondary,
  tone = "ok",
  promptLabel,
  promptPlaceholder,
  promptRequired,
}: NoticeModalProps) {
  const [promptValue, setPromptValue] = useState("")
  const toneBg =
    tone === "error" ? "bg-accent-pink/20" : tone === "warn" ? "bg-accent-pink/15" : "bg-accent-green"
  const toneMark = tone === "error" ? "!" : tone === "warn" ? "?" : "✓"
  const primaryDisabled = Boolean(promptRequired && promptLabel && !promptValue.trim())

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
          <span className="font-display font-black text-lg">{toneMark}</span>
        </div>
        <h3 id="notice-modal-title" className="text-xl font-display font-black uppercase tracking-tight pr-8">
          {title}
        </h3>
        <p className="text-sm font-medium text-foreground/85 leading-relaxed whitespace-pre-line">{body}</p>
        {promptLabel && (
          <label className="flex flex-col gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">{promptLabel}</span>
            <textarea
              value={promptValue}
              onChange={(e) => setPromptValue(e.target.value)}
              placeholder={promptPlaceholder}
              rows={3}
              className="w-full border-2 border-foreground p-3 text-sm font-medium resize-y min-h-[80px] focus:outline-none focus:ring-0"
              autoFocus
            />
          </label>
        )}
        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          {secondaryLabel && (
            <Button
              type="button"
              variant="outline"
              className="flex-1 font-black uppercase tracking-widest"
              onClick={() => {
                onSecondary?.()
                onClose()
              }}
            >
              {secondaryLabel}
            </Button>
          )}
          <Button
            type="button"
            variant="cta"
            className="flex-1 font-black uppercase tracking-widest"
            disabled={primaryDisabled}
            onClick={() => {
              onPrimary?.(promptValue.trim())
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
