import { Play } from "lucide-react"

interface HowItWorksVideoProps {
  /** Real video URL, once activation/process footage exists. Omit to show the placeholder - never fabricate a finished video. */
  videoUrl?: string
  posterUrl?: string
}

// Replaces the removed InteractiveLifecycle section per the brief: "this
// interactive life cycle should be replaced with a video because there is
// too much interaction... a short 30 seconds." Drop-in only - pass
// videoUrl once real footage exists, nothing else about the page needs to
// change.
export function HowItWorksVideo({ videoUrl, posterUrl }: HowItWorksVideoProps) {
  return (
    <section className="py-16 md:py-24 bg-background border-b-2 border-foreground">
      <div className="container px-4 mx-auto max-w-4xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-accent-green text-foreground text-xs font-black uppercase tracking-widest mb-3 border-2 border-foreground shadow-[2px_2px_0px_rgba(0,0,0,1)]">
            <span>How it works</span>
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-display font-black uppercase leading-tight tracking-tight">
            30 seconds, start to finish.
          </h2>
        </div>

        <div className="relative aspect-video w-full border-2 border-foreground bg-foreground shadow-[8px_8px_0px_rgba(0,0,0,1)] overflow-hidden">
          {videoUrl ? (
            <video
              src={videoUrl}
              poster={posterUrl}
              controls
              playsInline
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
              <div className="w-16 h-16 rounded-full bg-white/15 border-2 border-white/40 flex items-center justify-center">
                <Play size={28} className="ml-1 fill-white" />
              </div>
              <p className="text-sm font-black uppercase tracking-widest text-white/80">Video coming soon</p>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
