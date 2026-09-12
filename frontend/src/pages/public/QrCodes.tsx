import { useState } from "react"
import { Download, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { RelovedBadge } from "@/components/ui/RelovedBadge"
import { assetUrl } from "@/lib/assets"
import { GO_URL, INSTAGRAM_URL, SITE_URL, qrImageUrl } from "@/lib/logisticsLinks"

const CODES = [
  {
    id: "site",
    title: "Website",
    url: SITE_URL,
    hint: "Scan to open the live Reloved site",
  },
  {
    id: "instagram",
    title: "Instagram",
    url: INSTAGRAM_URL,
    hint: "Scan to follow @reloved.digital",
  },
  {
    id: "go",
    title: "Go / waitlist",
    url: GO_URL,
    hint: "Scan to open go.reloved.digital — join waitlist / launch landing",
  },
] as const

/** Brand magenta + white; high ECC so a centre logo still scans. */
const QR_OPTS = { color: "EC2F9B", bgcolor: "FFFFFF", ecc: "H" as const }

async function downloadBrandedQr(url: string, filename: string): Promise<void> {
  const size = 720
  const qrSrc = qrImageUrl(url, size, QR_OPTS)
  const logoSrc = `${assetUrl("/images/reloved-logo.png")}?v=11`

  const [qrImg, logoImg] = await Promise.all([
    loadImage(qrSrc, true),
    loadImage(logoSrc, false),
  ])

  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas unavailable")

  ctx.fillStyle = "#FFFFFF"
  ctx.fillRect(0, 0, size, size)
  ctx.drawImage(qrImg, 0, 0, size, size)

  // Keep logo ~18% of QR so scanners still read (ECC H).
  const logoBox = Math.round(size * 0.18)
  const cx = size / 2
  const cy = size / 2
  const pad = Math.round(logoBox * 0.18)

  ctx.fillStyle = "#FFFFFF"
  ctx.beginPath()
  ctx.arc(cx, cy, logoBox / 2 + pad, 0, Math.PI * 2)
  ctx.fill()

  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, logoBox / 2, 0, Math.PI * 2)
  ctx.clip()
  ctx.drawImage(logoImg, cx - logoBox / 2, cy - logoBox / 2, logoBox, logoBox)
  ctx.restore()

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"))
  if (!blob) throw new Error("Could not export PNG")

  const href = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = href
  a.download = filename
  a.click()
  URL.revokeObjectURL(href)
}

function loadImage(src: string, crossOrigin: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    if (crossOrigin) img.crossOrigin = "anonymous"
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load ${src}`))
    img.src = src
  })
}

function QrCard({
  id,
  title,
  url,
  hint,
}: {
  id: string
  title: string
  url: string
  hint: string
}) {
  const [downloading, setDownloading] = useState(false)

  const handleDownload = async () => {
    setDownloading(true)
    try {
      await downloadBrandedQr(url, `reloved-${id}-qr.png`)
    } catch {
      // Fallback: plain coloured QR without embedded logo
      window.open(qrImageUrl(url, 600, QR_OPTS), "_blank", "noopener,noreferrer")
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="border-2 border-foreground bg-white shadow-[4px_4px_0px_rgba(0,0,0,1)] flex flex-col">
      <div className="bg-accent-pink border-b-2 border-foreground px-4 py-2">
        <h2 className="text-sm font-display font-black uppercase tracking-widest text-center">{title}</h2>
      </div>

      <div className="p-6 flex flex-col gap-4 items-center text-center">
        <div className="relative border-2 border-foreground bg-white p-3 shadow-[3px_3px_0px_rgba(0,0,0,1)]">
          <img
            src={qrImageUrl(url, 360, QR_OPTS)}
            alt={`QR code for ${title}`}
            width={260}
            height={260}
            className="block w-[260px] h-[260px]"
          />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="rounded-full bg-white p-1.5 border-2 border-foreground shadow-[2px_2px_0px_rgba(0,0,0,1)]">
              <RelovedBadge className="w-12 h-12" />
            </div>
          </div>
        </div>

        <p className="text-sm text-foreground-muted">{hint}</p>
        <p className="text-xs font-mono break-all text-foreground-muted">{url}</p>

        <div className="flex flex-wrap gap-3 justify-center w-full pt-1">
          <Button
            size="sm"
            variant="outline"
            type="button"
            icon={<ExternalLink className="w-3.5 h-3.5" />}
            onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
          >
            Open link
          </Button>
          <Button
            size="sm"
            variant="cta"
            type="button"
            disabled={downloading}
            icon={<Download className="w-3.5 h-3.5" />}
            onClick={() => void handleDownload()}
          >
            {downloading ? "Saving…" : "Download PNG"}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function QrCodes() {
  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-10 py-8 px-4">
      <div>
        <p className="inline-block text-xs font-black uppercase tracking-widest bg-accent-pink border-2 border-foreground px-3 py-1 shadow-[2px_2px_0px_rgba(0,0,0,1)] mb-4">
          Launch kit
        </p>
        <h1 className="text-4xl font-display font-black uppercase tracking-tight">QR codes</h1>
        <p className="text-foreground-muted mt-3 max-w-2xl">
          Brand-pink codes with the Reloved badge in the centre. Print or download for posters, stickers, and Instagram.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
        {CODES.map((code) => (
          <QrCard key={code.id} {...code} />
        ))}
      </div>
    </div>
  )
}
