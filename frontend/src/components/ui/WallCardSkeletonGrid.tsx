/** Skeleton tiles matching Wall of Kindness card footprint (square photo + caption). */
export function WallCardSkeletonGrid({ count }: { count: number }) {
  return (
    <div
      className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5 md:gap-6 pt-4 pb-6"
      data-testid="wall-skeleton-grid"
      aria-busy="true"
      aria-label="Loading wall items"
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="pr-[5px] pb-[5px]" data-testid="wall-skeleton-card">
          <div className="bg-white border-2 border-foreground shadow-[5px_5px_0px_rgba(0,0,0,1)] relative flex flex-col h-full p-0.5 sm:p-1">
            <div className="aspect-square w-full border-2 border-foreground/15 overflow-hidden mb-1 shrink-0 relative bg-[#e8e2d8]">
              <div className="absolute inset-0 animate-pulse bg-[#d4cdc2]" />
              <div className="absolute left-[18%] right-[18%] top-[22%] h-3 rounded-sm bg-black/10" />
              <div className="absolute left-[28%] right-[28%] top-[38%] h-2.5 rounded-sm bg-black/10" />
              <div className="absolute left-[22%] right-[22%] bottom-[20%] h-3 rounded-sm bg-black/10" />
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[9px] font-black uppercase tracking-[0.18em] text-foreground/35">
                Loading
              </div>
            </div>
            <div className="px-0.5 pb-0.5 flex flex-col gap-1.5 min-h-[2.4em]">
              <div className="h-3 w-[88%] animate-pulse bg-black/10" />
              <div className="h-2 w-[55%] animate-pulse bg-black/10" />
              <div className="mt-1 pt-1 border-t border-foreground/15 flex justify-between gap-2">
                <div className="h-2 w-16 animate-pulse bg-black/10" />
                <div className="h-2 w-10 animate-pulse bg-black/10" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
