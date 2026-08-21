import { motion } from "motion/react"

export function GraffitiWallBackground() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden select-none z-0">
      {/* Plaster / Concrete Studio Wall Base */}
      <div 
        className="absolute inset-0 bg-[#EFECE6] opacity-100"
        style={{
          backgroundImage: `
            radial-gradient(circle at 15% 20%, rgba(220, 215, 205, 0.8) 0%, transparent 45%),
            radial-gradient(circle at 85% 75%, rgba(200, 195, 185, 0.7) 0%, transparent 50%),
            radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.5) 0%, transparent 60%)
          `
        }}
      />

      {/* Vibrant Mural & Spray Paint Layers behind cards (inspired by the urban gallery wall in screenshot) */}
      <div className="absolute inset-0 opacity-40 mix-blend-multiply">
        {/* Soft Spray Color Halos */}
        <div className="absolute top-10 left-10 w-[450px] h-[450px] rounded-full bg-[#3B82F6] blur-[120px] opacity-30" />
        <div className="absolute top-1/2 right-12 w-[500px] h-[500px] rounded-full bg-[#EF4444] blur-[140px] opacity-25" />
        <div className="absolute bottom-10 left-1/3 w-[400px] h-[400px] rounded-full bg-[#EAB308] blur-[100px] opacity-30" />
      </div>

      {/* Hand-painted Graffiti Art Vectors */}
      <svg className="absolute inset-0 w-full h-full text-foreground opacity-35" xmlns="http://www.w3.org/2000/svg">
        {/* Abstract Mural Strokes */}
        <path d="M -50 100 Q 150 20 350 180 T 750 80 T 1150 220" fill="none" stroke="#2563EB" strokeWidth="24" strokeLinecap="round" opacity="0.3" />
        <path d="M 200 400 C 400 200 600 500 800 300 C 1000 100 1200 400 1400 250" fill="none" stroke="#DC2626" strokeWidth="18" strokeLinecap="round" opacity="0.25" />
        <path d="M 100 600 Q 400 800 800 650 T 1300 700" fill="none" stroke="#10B981" strokeWidth="20" strokeLinecap="round" opacity="0.2" />

        {/* Graffiti Tag Text & Urban Marks */}
        <g transform="translate(80, 120) rotate(-6)">
          <text x="0" y="40" className="font-display font-black text-4xl fill-foreground tracking-widest opacity-20">LOVE &amp; KINDNESS</text>
        </g>
        
        <g transform="translate(900, 180) rotate(8)">
          <text x="0" y="40" className="font-display font-black text-3xl fill-foreground tracking-widest opacity-25">PRELOVED FREE</text>
        </g>

        {/* Drip Marks */}
        <g transform="translate(150, 250)">
          <path d="M 10 0 L 10 90 M 25 0 L 25 50 M 40 0 L 40 120" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.4" />
          <circle cx="10" cy="98" r="4" fill="currentColor" opacity="0.4" />
          <circle cx="40" cy="128" r="5" fill="currentColor" opacity="0.4" />
        </g>

        <g transform="translate(1050, 420)">
          <path d="M 15 0 L 15 110 M 35 0 L 35 70" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.4" />
          <circle cx="15" cy="118" r="4" fill="currentColor" opacity="0.4" />
        </g>

        {/* Crown & Star Tags */}
        <g transform="translate(70, 520) rotate(-12)">
          <path d="M 10 30 L 25 10 L 40 25 L 55 10 L 70 30 Z" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" opacity="0.5" />
        </g>
      </svg>

      {/* Artist Studio Paint Tube & Brush Accents at the Bottom Edge (Ref: Screenshot) */}
      <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black/10 to-transparent flex items-end justify-between px-8 pb-2 opacity-60">
        <div className="flex items-center gap-3">
          <div className="w-6 h-12 bg-accent-red border border-black transform -rotate-12 rounded-t-sm shadow-sm" />
          <div className="w-5 h-10 bg-accent-blue border border-black transform rotate-6 rounded-t-sm shadow-sm" />
          <div className="w-8 h-8 rounded-full border-2 border-black bg-accent-yellow shadow-sm" />
        </div>
        <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-foreground/40">
          ARTIST STUDIO WALL &bull; RE-LOVED GALLERY
        </div>
      </div>

      {/* Concrete Grain Texture Noise */}
      <div 
        className="absolute inset-0 opacity-20 mix-blend-multiply pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`
        }}
      />
    </div>
  )
}
