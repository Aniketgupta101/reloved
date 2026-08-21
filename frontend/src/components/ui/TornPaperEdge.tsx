/** A hand-torn paper edge, used as a section divider instead of a straight
 * line — matches the poster/tape aesthetic used elsewhere on the site.
 * Deliberately irregular (varying tooth width and depth, a few thin slivers
 * next to broad flat stretches) so it reads as torn, not a mechanical zigzag.
 *
 * viewBox is 0-30 tall and is meant to sit straddling a section seam at
 * y=15 (via equal +/- margins on its container). Every point's y is kept
 * between 15 and 30 on purpose: y<15 would dip into the section *above* the
 * seam, where nothing should ever be cut away — that gap used to expose the
 * page's own background (a slightly different shade than the section's own
 * color) as a stray line. Keeping the floor at 15 guarantees full coverage
 * above the seam everywhere, while all the jagged variation happens below
 * it, where transparency only ever reveals the section underneath.
 *
 * Stretches to fill its container (preserveAspectRatio="none"), so the
 * shape scales horizontally with viewport width while keeping its height. */
export const TORN_EDGE_POINTS =
  "400,18 383,29 372,16 366,24 344,30 333,17 306,26 300,15 " +
  "277,30 266,20 233,28 226,15 204,23 181,30 173,17 157,22 " +
  "128,29 117,16 100,26 76,15 65,23 48,18 30,30 19,16 6,25 0,17"

/** Clip-path that tears the bottom of a box so a photo can sit flush on the
 *  paper-cut. Teeth live in the last 4% of the box (matches the overlay SVG). */
export function heroTornClipPath(): string {
  const pts = TORN_EDGE_POINTS.trim().split(/\s+/).map((pair) => {
    const [x, y] = pair.split(",").map(Number)
    const px = (x / 400) * 100
    const py = 96 + ((y - 15) / 15) * 4
    return `${px.toFixed(2)}% ${py.toFixed(2)}%`
  })
  return `polygon(0% 0%, 100% 0%, ${pts.join(", ")})`
}

export function TornPaperEdge({
  fill = "var(--color-surface-muted)",
  className = "",
  strokeOnly = false,
}: {
  fill?: string
  className?: string
  strokeOnly?: boolean
}) {
  return (
    <svg
      viewBox={strokeOnly ? "0 15 400 15" : "0 0 400 30"}
      preserveAspectRatio="none"
      className={className}
      style={{ width: "100%", height: "100%", display: "block" }}
      aria-hidden="true"
    >
      {/* Filled shape: clean from y=0 down to y=15 (always), torn between y=15 and y=30.
          Skip the fill when the photo itself is the torn sheet (strokeOnly). */}
      {!strokeOnly && <polygon fill={fill} points={`0,0 400,0 ${TORN_EDGE_POINTS}`} />}
      {/* Stroke only the torn edge itself, not the clean top/sides. */}
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        className="text-foreground"
        points={TORN_EDGE_POINTS}
      />
    </svg>
  )
}
