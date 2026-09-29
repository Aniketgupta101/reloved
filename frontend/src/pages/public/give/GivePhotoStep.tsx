import { motion } from "motion/react"
import { Button } from "@/components/ui/Button"
import {
  Camera,
  ImagePlus,
  X,
  Sparkles,
  Loader2,
} from "lucide-react"
import { PrivacyPhotoNotice } from "@/components/ui/PrivacyBuildingNotice"
import { BULK_PHOTO_LIMIT, SINGLE_PHOTO_LIMIT } from "./model"
import { useGiveFlow } from "./giveFlow"
export function GivePhotoStep() {
  const {
    step,
    photoItems,
    setPhotoItems,
    setAiApplied,
    analyzing,
    uploadMode,
    setUploadMode,
    activeGroupId,
    setActiveGroupId,
    compressingPhotos,
    uniqueGroupCount,
    photoLimit,
    itemSlots,
    itemLabel,
    countInGroup,
    openCamera,
    openGallery,
    photoPickError,
    startNewItemGroup,
    assignPhotoToActiveItem,
    removePhoto,
    skipAutoFill,
    analyzeError,
    sensitivePhotoWarning,
    bgKeptNote,
    cameraInputRef,
    galleryInputRef,
    handlePhotoUpload,
    setDetailGroupId,
  } = useGiveFlow()
  return (
    <motion.div
      key="step1"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex flex-col gap-6 flex-1"
    >
      <div>
        <h2 className="text-3xl font-display font-bold uppercase mb-2">Drop something. Pass it on.</h2>
        <p className="text-foreground-muted">
          Take photos or choose from your gallery. We will ask for the details next.
        </p>
      </div>

      <PrivacyPhotoNotice />

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={analyzing || compressingPhotos}
          title={analyzing ? "Finish or skip AI before switching mode" : undefined}
          onClick={() => {
            if (analyzing || compressingPhotos) return
            setUploadMode("single")
            setActiveGroupId(0)
            setPhotoItems((prev) => prev.map((p) => ({ ...p, groupId: 0 })))
          }}
          className={`h-10 sm:h-12 border border-foreground sm:border-2 text-[11px] sm:text-xs font-black uppercase tracking-wide sm:tracking-widest disabled:opacity-40 disabled:cursor-not-allowed ${
            uploadMode === "single" ? "bg-accent-pink" : "bg-white hover:bg-black/5"
          }`}
        >
          One Item
        </button>
        <button
          type="button"
          disabled={analyzing || compressingPhotos}
          title={analyzing ? "Finish or skip AI before switching mode" : undefined}
          onClick={() => {
            if (analyzing || compressingPhotos) return
            setUploadMode("bulk")
            // Split existing One Item photos into separate listings.
            setPhotoItems((prev) => {
              if (prev.length <= 1) {
                setActiveGroupId(prev[0]?.groupId ?? 0)
                return prev
              }
              const next = prev.map((p, i) => ({ ...p, groupId: i }))
              setActiveGroupId(next.length - 1)
              setDetailGroupId(0)
              return next
            })
            setAiApplied(false)
          }}
          className={`h-10 sm:h-12 border border-foreground sm:border-2 text-[11px] sm:text-xs font-black uppercase tracking-wide sm:tracking-widest disabled:opacity-40 disabled:cursor-not-allowed ${
            uploadMode === "bulk" ? "bg-accent-pink" : "bg-white hover:bg-black/5"
          }`}
        >
          Multiple Items
        </button>
      </div>
      <p className="text-xs text-foreground-muted leading-relaxed border-l-2 border-foreground pl-3">
        {uploadMode === "bulk"
          ? `Each photo becomes its own item on the Wall (max ${BULK_PHOTO_LIMIT}). Need 2 angles of the same piece? Select that Item chip, then tap the extra photo to merge it.`
          : `One clear photo of the item. Reloved keeps your original and adds one AI studio version.`}
      </p>

      {photoItems.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 border-2 border-dashed border-foreground/30 p-8 bg-surface-muted">
          <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md">
            <Button
              type="button"
              variant="cta"
              onClick={openCamera}
              size="lg"
              disabled={compressingPhotos}
              className="h-16 w-full gap-3 font-bold"
            >
              <Camera className="w-6 h-6 shrink-0" />
              Take a photo
            </Button>
          </div>
          <p className="text-sm font-bold text-foreground-muted uppercase tracking-widest">or</p>
          <Button
            type="button"
            variant="secondary"
            onClick={openGallery}
            disabled={compressingPhotos}
            className="w-full max-w-md shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] font-bold"
          >
            <ImagePlus className="w-4 h-4 mr-2" /> Upload from gallery
          </Button>
          {compressingPhotos && (
            <p className="text-sm font-bold flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Adding photo…
            </p>
          )}
          {photoPickError && (
            <p className="text-xs font-bold text-accent-red text-center max-w-md">{photoPickError}</p>
          )}
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-4">
          {uploadMode === "bulk" && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-bold uppercase tracking-widest text-foreground">
                {uniqueGroupCount}/{BULK_PHOTO_LIMIT} items · {photoItems.length}/{BULK_PHOTO_LIMIT} photos
                {uniqueGroupCount >= BULK_PHOTO_LIMIT
                  ? " · limit reached"
                  : " · each photo = one item (tap to merge)"}
              </p>
              {uniqueGroupCount >= BULK_PHOTO_LIMIT && (
                <p className="text-xs font-bold border-2 border-foreground bg-accent-pink/20 px-3 py-2">
                  Limit {BULK_PHOTO_LIMIT}/{BULK_PHOTO_LIMIT} items — remove one to add another. This is not a bug.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {itemSlots.map((gid) => {
                  const n = itemLabel(gid)
                  const count = countInGroup(gid)
                  const selected = gid === activeGroupId
                  return (
                    <button
                      key={gid}
                      type="button"
                      disabled={analyzing}
                      onClick={() => setActiveGroupId(gid)}
                      className={`h-10 min-w-[4.5rem] px-3 border-2 border-foreground text-xs font-black uppercase tracking-widest disabled:opacity-50 ${
                        selected ? "bg-accent-pink" : "bg-white hover:bg-black/5"
                      }`}
                    >
                      Item {n}
                      {count > 0 ? ` (${count})` : ""}
                    </button>
                  )
                })}
                {photoItems.length < photoLimit && !analyzing && (
                  <button
                    type="button"
                    onClick={startNewItemGroup}
                    className="h-10 px-3 border-2 border-dashed border-foreground text-xs font-black uppercase tracking-widest bg-white hover:bg-black/5"
                    aria-label="Add another item"
                  >
                    + Item
                  </button>
                )}
              </div>
            </div>
          )}
          {uploadMode === "single" && photoItems.length > 0 && (
            <p className="text-xs font-bold uppercase tracking-widest text-foreground">
              {photoItems.length}/{SINGLE_PHOTO_LIMIT} photo for this item
              {photoItems.length >= SINGLE_PHOTO_LIMIT ? " · limit reached" : ""}
            </p>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {photoItems.map((p, index) => {
              const itemNum = itemLabel(p.groupId)
              const photosInGroup = photoItems.filter((x) => x.groupId === p.groupId)
              const photoNum = photosInGroup.indexOf(p) + 1
              const inActive = uploadMode === "bulk" && p.groupId === activeGroupId
              return (
              <div
                key={index}
                role={uploadMode === "bulk" ? "button" : undefined}
                tabIndex={uploadMode === "bulk" ? 0 : undefined}
                onClick={() => assignPhotoToActiveItem(index)}
                onKeyDown={(e) => {
                  if (uploadMode !== "bulk") return
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    assignPhotoToActiveItem(index)
                  }
                }}
                className={`relative aspect-square border-2 bg-surface-muted ${
                  inActive ? "border-accent-pink ring-2 ring-accent-pink/40" : "border-foreground"
                } ${uploadMode === "bulk" ? "cursor-pointer" : ""}`}
              >
                <img src={p.previewUrl} alt={`Upload ${index + 1}`} className="w-full h-full object-cover pointer-events-none" />
                {uploadMode === "bulk" ? (
                  <span className="absolute top-2 left-2 bg-white border-2 border-foreground px-1.5 py-0.5 text-[10px] font-black uppercase tracking-widest pointer-events-none">
                    Item {itemNum} · Pic {photoNum}
                  </span>
                ) : (
                  <span className="absolute top-2 left-2 bg-white border-2 border-foreground px-1.5 py-0.5 text-[10px] font-black uppercase tracking-widest">
                    Photo {photoNum}
                  </span>
                )}
                {p.status === "done" && (
                  <span className="absolute bottom-2 left-2 flex items-center gap-1 bg-accent-green border-2 border-foreground px-1.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-foreground shadow-[1px_1px_0px_rgba(0,0,0,1)] pointer-events-none">
                    <Sparkles className="w-3 h-3" /> AI enhanced
                  </span>
                )}
                {analyzing && p.status === "pending" && (
                  <div className="absolute inset-0 bg-white/70 flex items-center justify-center pointer-events-none">
                    <Loader2 className="w-6 h-6 animate-spin text-foreground" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    removePhoto(index)
                  }}
                  className="absolute top-2 right-2 p-1 bg-white border-2 border-foreground shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all z-10"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )})}

            {photoItems.length < photoLimit && (
              <div className="aspect-square border-2 border-dashed border-foreground/30 bg-surface-muted flex flex-col items-center justify-center gap-2 p-2">
                <button
                  type="button"
                  onClick={openCamera}
                  disabled={compressingPhotos}
                  className="w-full py-2 text-[10px] font-black uppercase tracking-wider border-2 border-foreground bg-white hover:bg-black/5 disabled:opacity-50"
                >
                  Camera
                </button>
                <button
                  type="button"
                  onClick={openGallery}
                  disabled={compressingPhotos}
                  className="w-full py-2 text-[10px] font-black uppercase tracking-wider border-2 border-foreground bg-white hover:bg-black/5 disabled:opacity-50"
                >
                  Gallery
                </button>
              </div>
            )}
          </div>
          {compressingPhotos && (
            <p className="text-sm font-bold flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Adding photo…
            </p>
          )}
          {photoPickError && (
            <p className="text-xs font-bold text-accent-red">{photoPickError}</p>
          )}
          <p className="text-xs text-foreground-muted mt-2 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" /> Our AI pre-fills details from your photos — you’ll confirm everything on the next step.
          </p>
          {analyzing && (
            <div className="mt-3 flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
              <p className="text-xs font-bold flex items-center gap-2 grow">
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                AI reading photos… You can skip title autofill — studio cutouts keep running.
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={skipAutoFill}
                className="font-bold uppercase tracking-wide sm:tracking-widest shrink-0 border-2 border-foreground"
                data-testid="skip-autofill"
              >
                Skip title autofill → fill myself
              </Button>
            </div>
          )}
          {analyzeError && (
            <p className="mt-2 text-xs font-bold border-2 border-foreground bg-accent-pink/15 px-3 py-2" data-testid="analyze-error">
              {analyzeError}
            </p>
          )}
          {sensitivePhotoWarning && (
            <p className="mt-2 text-xs font-bold border-2 border-foreground bg-accent-pink/20 px-3 py-2" data-testid="sensitive-photo-warning">
              {sensitivePhotoWarning}
            </p>
          )}
          {bgKeptNote && (
            <p className="mt-2 text-xs text-foreground-muted" data-testid="bg-kept-note">
              {bgKeptNote}
            </p>
          )}
        </div>
      )}

      {/* Separate inputs: capture forces camera on mobile; gallery must omit it. */}
      <input
        type="file"
        ref={cameraInputRef}
        className="sr-only"
        accept="image/*"
        capture="environment"
        onChange={handlePhotoUpload}
      />
      <input
        type="file"
        ref={galleryInputRef}
        className="sr-only"
        accept="image/*,.heic,.heif"
        multiple
        onChange={handlePhotoUpload}
      />
    </motion.div>
  )
}
