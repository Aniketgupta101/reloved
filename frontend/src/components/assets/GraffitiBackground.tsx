import { useEffect, useState } from "react"
import { motion } from "motion/react"

export function GraffitiBackground() {
  const [scrollY, setScrollY] = useState(0)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY)
    }

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)")
    setPrefersReducedMotion(mediaQuery.matches)

    const handleMotionChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches)
    }

    window.addEventListener("scroll", handleScroll, { passive: true })
    mediaQuery.addEventListener("change", handleMotionChange)

    return () => {
      window.removeEventListener("scroll", handleScroll)
      mediaQuery.removeEventListener("change", handleMotionChange)
    }
  }, [])

  const parallaxOffset = prefersReducedMotion ? 0 : scrollY * 0.08

  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden select-none" aria-hidden="true">
      {/* Concrete & Whitewash plaster texture overlay */}
      <div 
        className="absolute inset-0 bg-[#F4F1EA] opacity-100"
        style={{
          backgroundImage: `
            radial-gradient(circle at 10% 20%, rgba(230, 228, 224, 0.6) 0%, transparent 40%),
            radial-gradient(circle at 90% 80%, rgba(220, 215, 205, 0.5) 0%, transparent 50%),
            radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.4) 0%, transparent 60%)
          `
        }}
      />

      {/* Dynamic Parallax Container */}
      <div 
        className="absolute inset-0 transition-transform ease-out duration-100"
        style={{ transform: `translateY(${-parallaxOffset}px)` }}
      >
        {/* Soft Spray Paint Halo 1 (Acid Green Accent) */}
        <motion.div
          animate={prefersReducedMotion ? {} : {
            scale: [1, 1.08, 1],
            opacity: [0.12, 0.18, 0.12],
          }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -top-10 left-1/4 w-[450px] h-[450px] rounded-full bg-[#C6F136] blur-[100px] opacity-15"
        />

        {/* Soft Spray Paint Halo 2 (Cobalt Blue Accent) */}
        <motion.div
          animate={prefersReducedMotion ? {} : {
            scale: [1, 1.12, 1],
            opacity: [0.08, 0.14, 0.08],
          }}
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut", delay: 2 }}
          className="absolute top-1/3 right-10 w-[500px] h-[500px] rounded-full bg-[#2A48FF] blur-[120px] opacity-10"
        />

        {/* Soft Spray Paint Halo 3 (Warm Coral Accent) */}
        <motion.div
          animate={prefersReducedMotion ? {} : {
            scale: [1, 1.06, 1],
            opacity: [0.06, 0.12, 0.06],
          }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 4 }}
          className="absolute top-2/3 left-10 w-[400px] h-[400px] rounded-full bg-[#FF4D3E] blur-[110px] opacity-10"
        />

        {/* Hand-Drawn Graffiti SVG Spray Marks & Drips */}
        <svg 
          className="absolute inset-0 w-full h-full text-foreground opacity-20" 
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Top-left Hand-drawn Arrow */}
          <g transform="translate(60, 180) rotate(-12)">
            <path d="M 10 50 Q 60 10 120 40 T 180 20" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="6 4" />
            <path d="M 160 10 L 185 22 L 170 42" fill="none" stroke="currentColor" strokeWidth="3" />
            <text x="30" y="70" className="font-display font-black uppercase text-xs fill-foreground tracking-widest opacity-80">WALL OF KINDNESS →</text>
          </g>

          {/* Top-right Stencil Stamp */}
          <g transform="translate(1050, 120) rotate(8)">
            <rect x="0" y="0" width="140" height="42" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="12 4" />
            <text x="18" y="28" className="font-display font-black text-xl fill-foreground tracking-widest">PRE-LOVED</text>
          </g>

          {/* Middle Left Drip Lines */}
          <g transform="translate(40, 600)">
            <path d="M 20 0 L 20 120 M 45 0 L 45 80 M 70 0 L 70 150" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.6" />
            <circle cx="20" cy="128" r="3" fill="currentColor" />
            <circle cx="70" cy="158" r="4" fill="currentColor" />
          </g>

          {/* Right Middle Crown / Star Graffiti */}
          <g transform="translate(1120, 750) rotate(-15)">
            <path d="M 10 40 L 25 10 L 45 30 L 65 10 L 80 40 Z" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
            <circle cx="25" cy="5" r="3" fill="currentColor" />
            <circle cx="65" cy="5" r="3" fill="currentColor" />
            <text x="10" y="65" className="font-display font-black text-xs fill-foreground tracking-wider">₹0 COST</text>
          </g>

          {/* Bottom Left Hand-drawn Box */}
          <g transform="translate(80, 1200) rotate(5)">
            <path d="M 0 0 L 160 10 L 150 60 L 10 50 Z" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" />
            <text x="20" y="35" className="font-display font-black text-sm fill-foreground tracking-widest">KINDNESS ONLY</text>
          </g>

          {/* Bottom Right Spray Splatter */}
          <g transform="translate(1000, 1400)">
            <circle cx="30" cy="30" r="12" fill="currentColor" opacity="0.2" />
            <circle cx="50" cy="20" r="6" fill="currentColor" opacity="0.3" />
            <circle cx="15" cy="45" r="4" fill="currentColor" opacity="0.25" />
            <circle cx="65" cy="50" r="8" fill="currentColor" opacity="0.2" />
          </g>
        </svg>

        {/* Bottom Right Floating Badge - Non conflicting */}
        <motion.div
          animate={prefersReducedMotion ? {} : {
            y: [0, 12, 0],
            rotate: [8, 12, 8]
          }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          className="absolute top-[850px] right-8 hidden xl:block border-2 border-foreground bg-[#C6F136] text-foreground font-display font-black text-xs px-3 py-1 shadow-[3px_3px_0px_rgba(0,0,0,1)] uppercase tracking-widest opacity-80"
        >
          PRE-LOVED GOODS FOR FREE
        </motion.div>
      </div>

      {/* Fine plaster grain noise filter */}
      <div 
        className="absolute inset-0 opacity-25 mix-blend-multiply pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`
        }}
      />
    </div>
  )
}
