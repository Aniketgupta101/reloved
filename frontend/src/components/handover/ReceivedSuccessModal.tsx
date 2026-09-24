import { useRef, useState } from "react"
import { Camera, Share2, X } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { compressImageFile } from "@/lib/compressImage"
import { INSTAGRAM_URL } from "@/lib/logisticsLinks"

type Props = {
  itemTitle: string
  uploading?: boolean
  onUpload: (file: File, note?: string) => Promise<void>
  onSkip: () => void
  onClose: () => void
}

/**
 * Shown once both sides finish handover (giver Handed over + claimer Received).
 * Optional celebration photo / share — never blocks completing the transaction.
 */
export function ReceivedSuccessModal({ itemTitle, uploading, onUpload, onSkip, onClose }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [picked, setPicked] = useState<File | null>(null)
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  async function onPick(file: File | null) {
    setLocalError(null)
    if (!file) return
    try {
      const compressed = await compressImageFile(file)
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setPicked(compressed)
      setPreviewUrl(URL.createObjectURL(compressed))
    } catch {
      setLocalError("Couldn't read that photo. Try another one.")
    }
  }

  async function submitPhoto() {
    if (!picked) {
      setLocalError("Pick a photo first, or tap Maybe later.")
      return
    }
    setBusy(true)
    setLocalError(null)
    try {
      await onUpload(picked, note.trim() || undefined)
    } catch (err: any) {
      setLocalError(err?.message || "Couldn't save photo")
      setBusy(false)
      return
    }
    setBusy(false)
  }

  async function shareNative() {
    const text = `Just Reloved “${itemTitle}” on Reloved — preloved pieces, always free. ${INSTAGRAM_URL}`
    try {
      if (picked && navigator.canShare?.({ files: [picked] })) {
        await navigator.share({ files: [picked], text, title: "Reloved" })
        return
      }
      if (navigator.share) {
        await navigator.share({ text, title: "Reloved", url: INSTAGRAM_URL })
        return
      }
    } catch {
      /* user cancelled or unsupported */
    }
    window.open(INSTAGRAM_URL, "_blank", "noopener,noreferrer")
  }

  const locked = busy || Boolean(uploading)

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="received-success-title"
        className="bg-white border border-foreground sm:border-2 max-w-md w-full min-w-0 p-4 sm:p-8 shadow-[4px_4px_0px_rgba(0,0,0,1)] sm:shadow-[12px_12px_0px_rgba(0,0,0,1)] relative flex flex-col gap-4 max-h-[90vh] overflow-y-auto"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 p-2 bg-surface-muted border border-foreground sm:border-2 shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <div className="w-12 h-12 border border-foreground sm:border-2 flex items-center justify-center bg-accent-pink shrink-0">
          <span className="font-display font-black text-lg text-white">♥</span>
        </div>

        <h3 id="received-success-title" className="text-xl font-display font-black uppercase tracking-tight pr-10 text-balance">
          It’s yours! Reloved
        </h3>
        <p className="text-sm font-medium text-foreground/85 leading-relaxed">
          Congratulations — you benefited from someone’s goodness with{" "}
          <span className="font-bold text-foreground">{itemTitle}</span>. Don’t forget to pay it forward.
        </p>
        <p className="text-xs font-bold text-foreground-muted uppercase tracking-widest">
          Optional — share a photo of what you received
        </p>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => void onPick(e.target.files?.[0] || null)}
        />

        {previewUrl ? (
          <div className="border-2 border-foreground bg-surface-muted overflow-hidden aspect-[4/3]">
            <img src={previewUrl} alt="Your Reloved moment" className="w-full h-full object-contain" />
          </div>
        ) : (
          <button
            type="button"
            disabled={locked}
            onClick={() => inputRef.current?.click()}
            className="flex flex-col items-center justify-center gap-2 py-8 border-2 border-dashed border-foreground bg-[#F7F5F0] hover:bg-accent-green/20 transition-colors"
          >
            <Camera size={22} />
            <span className="text-xs font-black uppercase tracking-widest">Upload or take a photo</span>
          </button>
        )}

        <label className="flex flex-col gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">
            Quick note (optional)
          </span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 280))}
            placeholder="How did it feel? Say thanks to kindness…"
            rows={2}
            disabled={locked}
            className="w-full border-2 border-foreground p-3 text-sm font-medium resize-y min-h-[64px] focus:outline-none bg-background"
          />
        </label>

        {localError && (
          <p className="text-xs font-bold text-accent-red">{localError}</p>
        )}

        <div className="flex flex-col gap-2 pt-1 min-w-0">
          <Button type="button" variant="cta" disabled={locked || !picked} onClick={() => void submitPhoto()} className="w-full">
            {locked ? "Saving…" : "Save photo"}
          </Button>
          <div className="flex flex-col gap-2 min-w-0">
            <Button
              type="button"
              variant="outline"
              disabled={locked}
              className="w-full gap-2"
              onClick={() => void shareNative()}
            >
              <Share2 size={14} className="shrink-0" />
              Share
            </Button>
            <Button type="button" variant="ghost" disabled={locked} className="w-full" onClick={onSkip}>
              Maybe later
            </Button>
          </div>
          {previewUrl && (
            <button
              type="button"
              disabled={locked}
              onClick={() => inputRef.current?.click()}
              className="text-[10px] font-black uppercase tracking-widest underline text-foreground-muted"
            >
              Choose a different photo
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
