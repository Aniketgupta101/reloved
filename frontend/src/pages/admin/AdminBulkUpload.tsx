import { useRef, useState } from "react"
import { api, resolveImageUrl } from "@/lib/api"
import { Card, CardContent } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Textarea } from "@/components/ui/Textarea"
import { SafeImage } from "@/components/ui/SafeImage"
import { compressImageFiles } from "@/lib/compressImage"

interface AnalyzedItem {
  key: string
  storagePath: string
  url: string
  title: string
  category: string
  gender: string
  description: string
  condition: string
  brand: string
  size: string
  quantity: number
  locality: string
  failed?: boolean
}

export function AdminBulkUpload() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [items, setItems] = useState<AnalyzedItem[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [conditions, setConditions] = useState<string[]>([])
  const [defaultLocality, setDefaultLocality] = useState("Mumbai")
  const [error, setError] = useState<string | null>(null)
  const [committed, setCommitted] = useState(false)

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return

    setAnalyzing(true)
    setError(null)
    setCommitted(false)

    try {
      const compressed = await compressImageFiles(Array.from(files))
      const form = new FormData()
      compressed.forEach((file) => form.append("photos", file))

      const data = await api.admin.postForm<{
        results: any[]
        categories: string[]
        conditions: string[]
      }>("/api/admin/bulk-upload/analyze", form)

      setCategories(data.categories)
      setConditions(data.conditions)

      const analyzed: AnalyzedItem[] = data.results.map((r, i) => {
        if (!r.ok) {
          return {
            key: `${Date.now()}-${i}`,
            storagePath: "",
            url: "",
            title: r.originalName,
            category: data.categories[0] || "",
            gender: "unisex",
            description: "",
            condition: data.conditions[0] || "",
            brand: "",
            size: "",
            quantity: 1,
            locality: defaultLocality,
            failed: true,
          }
        }
        return {
          key: `${Date.now()}-${i}`,
          storagePath: r.storagePath,
          url: r.url,
          title: r.suggestion.title,
          category: r.suggestion.category,
          gender: r.suggestion.gender || "unisex",
          description: r.suggestion.description,
          condition: r.suggestion.condition,
          brand: r.suggestion.brand || "",
          size: "",
          quantity: 1,
          locality: defaultLocality,
        }
      })

      setItems((prev) => [...prev, ...analyzed])
    } catch (err: any) {
      setError(err?.message || "Failed to analyze photos")
    } finally {
      setAnalyzing(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  function updateItem(key: string, patch: Partial<AnalyzedItem>) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)))
  }

  function removeItem(key: string) {
    setItems((prev) => prev.filter((it) => it.key !== key))
  }

  async function handleCommit() {
    const toCommit = items.filter((it) => !it.failed)
    if (toCommit.length === 0) return

    setCommitting(true)
    setError(null)

    try {
      await api.admin.post("/api/admin/bulk-upload/commit", {
        items: toCommit.map((it) => ({
          storagePath: it.storagePath,
          title: it.title,
          category: it.category,
          gender: it.gender || "unisex",
          description: it.description,
          condition: it.condition,
          brand: it.brand || null,
          size: it.size || null,
          quantity: it.quantity,
          locality: it.locality,
        })),
      })
      setItems([])
      setCommitted(true)
    } catch (err: any) {
      setError(err?.message || "Failed to save items")
    } finally {
      setCommitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-8 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-display font-black uppercase tracking-tight">Bulk Upload</h1>
        <p className="text-foreground-muted mt-2">
          Upload item photos directly. Each one gets its background removed onto white and an AI-suggested title,
          category and description - review and edit before saving.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-black uppercase tracking-widest text-foreground-muted">Default locality for this batch</label>
            <Input value={defaultLocality} onChange={(e) => setDefaultLocality(e.target.value)} className="w-48" />
          </div>
          <Button onClick={() => fileInputRef.current?.click()} disabled={analyzing} size="sm">
            {analyzing ? "Analyzing..." : "Choose photos"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFiles}
          />
          {analyzing && <span className="text-sm text-foreground-muted">Removing backgrounds and asking Gemini for details - this can take a moment per photo.</span>}
        </CardContent>
      </Card>

      {error && (
        <div className="bg-white border-2 border-accent-red p-4 font-bold text-accent-red text-sm shadow-[4px_4px_0px_rgba(0,0,0,1)]">{error}</div>
      )}

      {committed && (
        <div className="bg-accent-green border-2 border-foreground p-4 font-black uppercase tracking-widest text-sm shadow-[4px_4px_0px_rgba(0,0,0,1)]">
          Items saved and live on the Wall of Kindness.
        </div>
      )}

      {items.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-xs font-black uppercase tracking-widest text-foreground-muted">{items.length} item{items.length === 1 ? "" : "s"} ready for review</p>
            <Button onClick={handleCommit} disabled={committing || items.every((it) => it.failed)} size="sm">
              {committing ? "Saving..." : `Save ${items.filter((it) => !it.failed).length} item(s)`}
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {items.map((item) => (
              <Card key={item.key}>
                <CardContent className="flex flex-col gap-3">
                  {item.failed ? (
                    <div className="text-sm text-accent-red font-bold">Processing failed for "{item.title}" - remove and re-upload.</div>
                  ) : (
                    <SafeImage src={resolveImageUrl(item.storagePath)} alt={item.title} className="w-full aspect-square object-cover border-2 border-foreground bg-surface-muted" />
                  )}

                  <Input value={item.title} onChange={(e) => updateItem(item.key, { title: e.target.value })} placeholder="Title" />

                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={item.category}
                      onChange={(e) => updateItem(item.key, { category: e.target.value })}
                      className="h-10 rounded-none border-2 border-foreground px-3 text-sm font-bold bg-white"
                    >
                      {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <select
                      value={item.gender}
                      onChange={(e) => updateItem(item.key, { gender: e.target.value })}
                      className="h-10 rounded-none border-2 border-foreground px-3 text-sm font-bold bg-white"
                    >
                      {["men", "women", "girls", "boys", "unisex"].map((g) => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={item.condition}
                      onChange={(e) => updateItem(item.key, { condition: e.target.value })}
                      className="h-10 rounded-none border-2 border-foreground px-3 text-sm font-bold bg-white"
                    >
                      {conditions.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <Input value={item.size} onChange={(e) => updateItem(item.key, { size: e.target.value })} placeholder="Size" />
                  </div>

                  <Textarea
                    value={item.description}
                    onChange={(e) => updateItem(item.key, { description: e.target.value })}
                    className="h-20"
                    placeholder="Description"
                  />

                  <div className="grid grid-cols-2 gap-2">
                    <Input value={item.brand} onChange={(e) => updateItem(item.key, { brand: e.target.value })} placeholder="Brand" />
                    <Input type="number" min={1} value={item.quantity} onChange={(e) => updateItem(item.key, { quantity: Number(e.target.value) })} />
                  </div>

                  <Input value={item.locality} onChange={(e) => updateItem(item.key, { locality: e.target.value })} placeholder="Locality" />

                  <button onClick={() => removeItem(item.key)} className="text-xs font-black uppercase tracking-widest text-foreground-muted hover:text-accent-red text-left">
                    Remove from batch
                  </button>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
