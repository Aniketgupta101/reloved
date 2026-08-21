/** Circular logo badge — frontend/assets/.aistudio/reloved-logo.png,
 * served from /images/reloved-logo.png and center-cropped into a circle. */
export function RelovedBadge({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-full overflow-hidden shadow-[0_4px_18px_rgba(0,0,0,0.35)] ${className}`}>
      <img src="/images/reloved-logo.png" alt="reloved" className="w-full h-full object-cover" />
    </div>
  )
}
