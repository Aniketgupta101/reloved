import { motion } from "motion/react"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Textarea } from "@/components/ui/Textarea"
import { Sparkles, Loader2 } from "lucide-react"
import {
  APPAREL_SIZES,
  DROP_CATEGORY_OPTIONS,
  DROP_GENDER_OPTIONS,
  KIDS_AGE_BANDS,
} from "@shared/taxonomy"
import { useGiveFlow } from "./giveFlow"
export function GiveDetailsStep() {
  const {
    photoItems,
    itemDrafts,
    aiApplied,
    analyzing,
    uniqueGroupCount,
    itemLabel,
    isMultiItem,
    groupsMissingAiTitle,
    retryAiForRemaining,
    uniqueGroups,
    detailGroup,
    draftIncompleteReasons,
    resolveGroupDraft,
    selectDetailGroup,
    incompleteMultiGroups,
    multiIncompleteNote,
    activeDraft,
    formData,
    setFormData,
    patchActiveDraft,
    sizeRequiredForDraft,
  } = useGiveFlow()
  return (
    <motion.div
      key="step2"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex flex-col gap-6 flex-1"
    >
      <div>
        <h2 className="text-3xl font-display font-bold uppercase mb-2">Item Details</h2>
        <p className="text-foreground-muted">
          {isMultiItem
            ? `You’re posting ${uniqueGroupCount} items. Switch tabs below to review AI details for each.`
            : "Tell us about what you are passing on."}
        </p>
      </div>

      {aiApplied && (
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest bg-accent-green/15 text-foreground border-2 border-foreground px-3 py-2">
          <Sparkles className="w-4 h-4" /> Pre-filled from your photo by AI - please review and edit.
        </div>
      )}

      {isMultiItem && groupsMissingAiTitle().length > 0 && (
        <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center border-2 border-foreground bg-accent-pink/15 px-3 py-2">
          <p className="text-xs font-bold grow">
            {groupsMissingAiTitle().length} item{groupsMissingAiTitle().length === 1 ? "" : "s"} still need AI
            (tabs still say “Item #”). Run AI on those, or type titles yourself.
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={analyzing}
            onClick={retryAiForRemaining}
            className="font-bold uppercase tracking-wide text-xs shrink-0 border-2 border-foreground"
            data-testid="retry-ai-remaining"
          >
            {analyzing ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> AI working…
              </span>
            ) : (
              "Run AI on remaining"
            )}
          </Button>
        </div>
      )}

      {isMultiItem && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
          {uniqueGroups.map((gid) => {
            const n = itemLabel(gid)
            const selected = gid === detailGroup
            const thumb = photoItems.find((p) => p.groupId === gid)
            const title =
              itemDrafts[gid]?.itemTitle ||
              thumb?.suggestion?.title ||
              `Item ${n}`
            const incomplete = draftIncompleteReasons(resolveGroupDraft(gid)).length > 0
            return (
              <button
                key={gid}
                type="button"
                onClick={() => selectDetailGroup(gid)}
                className={`flex items-center gap-2 h-12 pl-1 pr-3 border-2 text-xs font-black uppercase tracking-widest ${
                  selected
                    ? "bg-accent-pink border-foreground"
                    : incomplete
                      ? "bg-accent-pink/20 border-accent-red"
                      : "bg-white border-foreground hover:bg-black/5"
                }`}
                title={incomplete ? "Needs size or other required fields" : undefined}
              >
                {thumb && (
                  <img
                    src={thumb.previewUrl}
                    alt=""
                    className="h-9 w-9 object-cover border border-foreground"
                  />
                )}
                Item {n}
                {incomplete && (
                  <span className="text-accent-red normal-case tracking-normal font-bold" aria-hidden>
                    !
                  </span>
                )}
                <span className="hidden sm:inline font-sans font-medium normal-case tracking-normal text-foreground-muted max-w-[8rem] truncate">
                  {title}
                </span>
              </button>
            )
          })}
          </div>
          {incompleteMultiGroups().length > 0 && (
            <p className="text-xs font-bold border-2 border-foreground bg-accent-pink/15 px-3 py-2" data-testid="multi-incomplete-hint">
              {(() => {
                const incomplete = incompleteMultiGroups()
                const needTitle = incomplete.filter((x) => x.reasons.includes("title"))
                const needSize = incomplete.filter((x) => x.reasons.includes("size") || x.reasons.includes("age"))
                const parts: string[] = []
                if (needTitle.length) {
                  parts.push(
                    `Items ${needTitle.map((x) => x.label).join(", ")} still need a TITLE (AI didn’t fill those — type one or tap “Run AI on remaining”)`,
                  )
                }
                if (needSize.length) {
                  parts.push(
                    `Items ${needSize.map((x) => x.label).join(", ")} still need a SIZE`,
                  )
                }
                return parts.join(". ") + "."
              })()}
            </p>
          )}
          {multiIncompleteNote && (
            <p className="text-xs font-bold border-2 border-accent-red bg-accent-pink/20 px-3 py-2" data-testid="multi-continue-block">
              {multiIncompleteNote}
            </p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-bold uppercase tracking-widest text-foreground">Item Title *</label>
          <Input
            value={isMultiItem ? activeDraft.itemTitle : formData.itemTitle}
            onChange={(e) =>
              isMultiItem
                ? patchActiveDraft({ itemTitle: e.target.value })
                : setFormData({ ...formData, itemTitle: e.target.value })
            }
            placeholder="e.g. Vintage Denim Jacket"
            className="rounded-none border-2 border-foreground"
          />
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold uppercase tracking-widest text-foreground">Category *</label>
            <select 
               value={
                 (() => {
                   const cat = isMultiItem ? activeDraft.category : formData.category
                   return DROP_CATEGORY_OPTIONS.some((o) => o.value === cat)
                     ? cat
                     : cat === "Kicks"
                       ? "Kicks"
                       : cat === "Bags"
                         ? "Bags"
                         : "Tops"
                 })()
               } 
               onChange={(e) =>
                 isMultiItem
                   ? patchActiveDraft({ category: e.target.value })
                   : setFormData({ ...formData, category: e.target.value })
               }
               className="flex h-10 w-full bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 rounded-none border-2 border-foreground"
             >
              {DROP_CATEGORY_OPTIONS.map(({ label, value }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold uppercase tracking-widest text-foreground">For *</label>
            <select
               value={isMultiItem ? activeDraft.gender : formData.gender}
               onChange={(e) =>
                 isMultiItem
                   ? patchActiveDraft({ gender: e.target.value, size: "", age: "" })
                   : setFormData({ ...formData, gender: e.target.value, size: "", age: "" })
               }
               className="flex h-10 w-full bg-background px-3 py-2 text-sm rounded-none border-2 border-foreground"
             >
              {DROP_GENDER_OPTIONS.map(({ label, value }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold uppercase tracking-widest text-foreground">Condition *</label>
            <select 
               value={isMultiItem ? activeDraft.condition : formData.condition} 
               onChange={(e) =>
                 isMultiItem
                   ? patchActiveDraft({ condition: e.target.value })
                   : setFormData({ ...formData, condition: e.target.value })
               }
               className="flex h-10 w-full bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 rounded-none border-2 border-foreground"
             >
              <option value="Excellent">Excellent</option>
              <option value="Good">Good</option>
              <option value="Fair but fully usable">Fair but fully usable</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold uppercase tracking-widest text-foreground">
              {(isMultiItem ? activeDraft.gender : formData.gender) === "girls" ||
              (isMultiItem ? activeDraft.gender : formData.gender) === "boys"
                ? "Age band *"
                : sizeRequiredForDraft(
                    isMultiItem ? activeDraft.category : formData.category,
                    isMultiItem ? activeDraft.gender : formData.gender,
                  )
                  ? "Size *"
                  : "Size"}
            </label>
            {(isMultiItem ? activeDraft.gender : formData.gender) === "girls" ||
            (isMultiItem ? activeDraft.gender : formData.gender) === "boys" ? (
              <select
                value={isMultiItem ? activeDraft.age : formData.age}
                onChange={(e) =>
                  isMultiItem
                    ? patchActiveDraft({ age: e.target.value, size: e.target.value })
                    : setFormData({ ...formData, age: e.target.value, size: e.target.value })
                }
                className="flex h-10 w-full bg-background px-3 py-2 text-sm rounded-none border-2 border-foreground"
                required
              >
                <option value="">Select age band</option>
                {KIDS_AGE_BANDS.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            ) : sizeRequiredForDraft(
                isMultiItem ? activeDraft.category : formData.category,
                isMultiItem ? activeDraft.gender : formData.gender,
              ) ? (
              <select
                value={isMultiItem ? activeDraft.size : formData.size}
                onChange={(e) =>
                  isMultiItem
                    ? patchActiveDraft({ size: e.target.value })
                    : setFormData({ ...formData, size: e.target.value })
                }
                className="flex h-10 w-full bg-background px-3 py-2 text-sm rounded-none border-2 border-foreground"
                required
              >
                <option value="">Select size</option>
                {APPAREL_SIZES.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            ) : (
              <Input
                value={isMultiItem ? activeDraft.size : formData.size}
                onChange={(e) =>
                  isMultiItem
                    ? patchActiveDraft({ size: e.target.value })
                    : setFormData({ ...formData, size: e.target.value })
                }
                placeholder="Optional"
                className="rounded-none border-2 border-foreground"
              />
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold uppercase tracking-widest text-foreground">Brand</label>
            <Input
              value={isMultiItem ? activeDraft.brand : formData.brand}
              onChange={(e) =>
                isMultiItem
                  ? patchActiveDraft({ brand: e.target.value })
                  : setFormData({ ...formData, brand: e.target.value })
              }
              placeholder="Optional"
              className="rounded-none border-2 border-foreground"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold uppercase tracking-widest text-foreground">Quantity *</label>
            <Input
              type="number"
              min="1"
              value={isMultiItem ? activeDraft.quantity : formData.quantity}
              onChange={(e) => {
                const q = parseInt(e.target.value) || 1
                isMultiItem
                  ? patchActiveDraft({ quantity: q })
                  : setFormData({ ...formData, quantity: q })
              }}
              className="rounded-none border-2 border-foreground"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-bold uppercase tracking-widest text-foreground">Description</label>
          <Textarea
            value={isMultiItem ? activeDraft.description : formData.description}
            onChange={(e) =>
              isMultiItem
                ? patchActiveDraft({ description: e.target.value })
                : setFormData({ ...formData, description: e.target.value })
            }
            placeholder="Optional — why are you dropping it? What should someone know?"
            className="rounded-none border-2 border-foreground h-24"
          />
        </div>
        
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-bold uppercase tracking-widest text-foreground">Any defects? (Optional)</label>
          <Input
            value={isMultiItem ? activeDraft.defect : formData.defect}
            onChange={(e) =>
              isMultiItem
                ? patchActiveDraft({ defect: e.target.value })
                : setFormData({ ...formData, defect: e.target.value })
            }
            placeholder="e.g. Missing a button, minor scratch - leave blank if none"
            className="rounded-none border-2 border-foreground"
          />
        </div>
      </div>
    </motion.div>
  )
}
