import * as React from "react"
import { motion } from "motion/react"

interface SubtleGraffitiOverlayProps {
  className?: string
  opacity?: number
}

export function SubtleGraffitiOverlay({ className = "", opacity = 0.35 }: SubtleGraffitiOverlayProps) {
  return (
    <div 
      className={`absolute inset-0 pointer-events-none overflow-hidden select-none z-0 ${className}`}
      style={{ opacity }}
    >
      {/* Background Plaster/Concrete subtle radial tone */}
      <div 
        className="absolute inset-0"
        style={{
          backgroundImage: `
            radial-gradient(circle at 15% 25%, rgba(245, 240, 230, 0.8) 0%, transparent 45%),
            radial-gradient(circle at 85% 75%, rgba(235, 230, 220, 0.7) 0%, transparent 50%),
            radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.6) 0%, transparent 65%)
          `
        }}
      />

      {/* Floating Animated Spray Paint Halos (Framer Motion Dynamic Blobs) */}
      <div className="absolute inset-0 mix-blend-multiply opacity-60">
        <motion.div 
          animate={{
            x: [0, 40, -30, 0],
            y: [0, -30, 25, 0],
            scale: [1, 1.12, 0.92, 1]
          }}
          transition={{
            duration: 18,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="absolute -top-20 -left-20 w-[420px] h-[420px] rounded-full bg-accent-blue/30 blur-[110px]" 
        />

        <motion.div 
          animate={{
            x: [0, -50, 30, 0],
            y: [0, 40, -25, 0],
            scale: [1, 1.18, 0.9, 1]
          }}
          transition={{
            duration: 22,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="absolute top-1/4 -right-20 w-[450px] h-[450px] rounded-full bg-accent-red/25 blur-[130px]" 
        />

        <motion.div 
          animate={{
            x: [0, 30, -40, 0],
            y: [0, -20, 30, 0],
            scale: [1, 1.15, 0.95, 1]
          }}
          transition={{
            duration: 16,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="absolute -bottom-20 left-1/3 w-[400px] h-[400px] rounded-full bg-accent-yellow/30 blur-[100px]" 
        />

        <motion.div 
          animate={{
            x: [0, -35, 20, 0],
            y: [0, -35, 15, 0],
            scale: [1, 1.2, 0.88, 1]
          }}
          transition={{
            duration: 25,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="absolute top-2/3 left-10 w-[350px] h-[350px] rounded-full bg-accent-green/25 blur-[120px]" 
        />
      </div>

      {/* SVG Texture Pattern & Dynamic Motion Paths */}
      <svg className="absolute inset-0 w-full h-full text-foreground pointer-events-none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="dot-texture" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="3" cy="3" r="1.2" fill="currentColor" opacity="0.07" />
          </pattern>
        </defs>

        <rect width="100%" height="100%" fill="url(#dot-texture)" />
      </svg>

      {/* Floating Dynamic Graffiti Vector Art Elements (Framer Motion) */}
      <div className="absolute inset-0 pointer-events-none">
        
        {/* Abstract Wavy Blue Spray Ribbon (Top Left to Right) */}
        <motion.div
          animate={{
            y: [0, -12, 8, 0],
            rotate: [0, 1.5, -1, 0]
          }}
          transition={{
            duration: 12,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="absolute top-[8%] left-0 right-0 h-32 opacity-25"
        >
          <svg className="w-full h-full" viewBox="0 0 1200 120" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M -50 60 Q 300 0 600 80 T 1250 40" stroke="#2563EB" strokeWidth="18" strokeLinecap="round" opacity="0.4" />
          </svg>
        </motion.div>

        {/* Abstract Curved Red Ribbon (Middle background) */}
        <motion.div
          animate={{
            y: [0, 15, -10, 0],
            rotate: [0, -2, 1, 0]
          }}
          transition={{
            duration: 15,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="absolute top-[38%] left-0 right-0 h-40 opacity-20"
        >
          <svg className="w-full h-full" viewBox="0 0 1200 140" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M 0 80 C 350 10 700 140 1200 50" stroke="#DC2626" strokeWidth="14" strokeLinecap="round" opacity="0.5" />
          </svg>
        </motion.div>

        {/* Floating Crown Stencil Art (Bottom Left) */}
        <motion.div
          animate={{
            y: [0, -14, 0],
            rotate: [-8, -4, -8],
            scale: [1, 1.05, 1]
          }}
          transition={{
            duration: 7,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="absolute bottom-[15%] left-[5%] text-foreground opacity-30"
        >
          <svg width="60" height="40" viewBox="0 0 60 40" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M 5 35 L 18 10 L 30 25 L 42 10 L 55 35 Z" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
            <circle cx="5" cy="35" r="3" fill="currentColor" />
            <circle cx="30" cy="25" r="3" fill="currentColor" />
            <circle cx="55" cy="35" r="3" fill="currentColor" />
          </svg>
        </motion.div>

        {/* Floating Heart Graffiti Scribble (Top Right) */}
        <motion.div
          animate={{
            y: [0, 12, 0],
            rotate: [12, 18, 12],
            scale: [1, 1.08, 1]
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="absolute top-[12%] right-[8%] text-accent-red opacity-30"
        >
          <svg width="50" height="50" viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M 25 42 C 25 42 6 28 6 16 C 6 9 12 4 19 4 C 23 4 25 8 25 8 C 25 8 27 4 31 4 C 38 4 44 9 44 16 C 44 28 25 42 25 42 Z" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </motion.div>

        {/* Floating Paint Drips (Left Side) */}
        <motion.div
          animate={{
            y: [0, -8, 0]
          }}
          transition={{
            duration: 6,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="absolute top-[28%] left-[8%] text-foreground opacity-25"
        >
          <svg width="40" height="90" viewBox="0 0 40 90" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M 5 0 L 5 50 M 18 0 L 18 30 M 30 0 L 30 65" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            <circle cx="5" cy="58" r="3" fill="currentColor" />
            <circle cx="30" cy="74" r="3.5" fill="currentColor" />
          </svg>
        </motion.div>

        {/* Floating Paint Drips (Right Side) */}
        <motion.div
          animate={{
            y: [0, 10, 0]
          }}
          transition={{
            duration: 7.5,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="absolute bottom-[20%] right-[7%] text-foreground opacity-25"
        >
          <svg width="30" height="80" viewBox="0 0 30 80" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M 6 0 L 6 55 M 20 0 L 20 30" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            <circle cx="6" cy="63" r="3.5" fill="currentColor" />
          </svg>
        </motion.div>

        {/* Dynamic Starburst / Sparkle Spray Mark (Bottom Center Right) */}
        <motion.div
          animate={{
            rotate: [0, 180, 360],
            scale: [0.9, 1.1, 0.9]
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: "linear"
          }}
          className="absolute bottom-[8%] right-[25%] text-accent-yellow opacity-35"
        >
          <svg width="45" height="45" viewBox="0 0 45 45" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M 22.5 0 L 22.5 45 M 0 22.5 L 45 22.5 M 6 6 L 39 39 M 39 6 L 6 39" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </motion.div>

      </div>
    </div>
  )
}
