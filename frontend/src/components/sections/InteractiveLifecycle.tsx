import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "motion/react"
import { Link } from "react-router-dom"
import { 
  ShieldCheck, 
  HeartHandshake, 
  CheckCircle2, 
  ArrowRight, 
  Play, 
  Pause, 
  Home as HomeIcon, 
  BadgeCheck, 
  Recycle,
  Sparkle
} from "lucide-react"
import { Tape, FreeStamp } from "@/components/assets/RelovedAssets"
import { Button } from "@/components/ui/Button"
import { SafeImage } from "@/components/ui/SafeImage"
import { BackdropLayer, useSectionBackdrop } from "@/components/ui/SectionBackdrop"

interface LifecycleItem {
  id: string
  title: string
  category: string
  image: string
  donor: string
  location: string
  impactNote: string
}

// 4 Completely unique sample items with non-repeating images across the app
const SAMPLE_ITEMS: LifecycleItem[] = [
  {
    id: "item-1",
    title: "Desk Keyboard & Mouse",
    category: "Electronics",
    image: "https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=800&q=80",
    donor: "Ananya S.",
    location: "Bandra West, Mumbai",
    impactNote: "Upgraded setup. Now helping a student complete online homework."
  },
  {
    id: "item-2",
    title: "Wooden Chess Set",
    category: "Games & Hobbies",
    image: "https://images.unsplash.com/photo-1529699211952-734e80c4d42b?w=800&q=80",
    donor: "Rohan M.",
    location: "Andheri East, Mumbai",
    impactNote: "Sitting on shelf. Now gifted to an after-school youth chess club."
  },
  {
    id: "item-3",
    title: "Leather Travel Satchel",
    category: "Bags & Accessories",
    image: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&q=80",
    donor: "Priya K.",
    location: "Juhu, Mumbai",
    impactNote: "Lightly used. Now carrying textbooks for a young scholar."
  },
  {
    id: "item-4",
    title: "Thermal Water Bottle",
    category: "Essentials",
    image: "https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=800&q=80",
    donor: "Vikram R.",
    location: "Powai, Mumbai",
    impactNote: "Spare flask. Keeping cold water fresh for a local student athlete."
  }
]

const LIFECYCLE_STEPS = [
  {
    step: 1,
    id: "unused",
    title: "Unused at Home",
    subtitle: "Tucked away in storage",
    icon: HomeIcon,
    badgeColor: "bg-foreground text-background",
    statusText: "Status: Idle in Storage",
    statusBadge: "Unused",
    description: "Quality items often sit forgotten. Instead of throwing them out or dealing with resale haggling, list them freely for your community.",
    benefits: [
      "De-clutter your home with social impact",
      "Prevent landfill waste effortlessly",
      "No haggling, fees, or unwanted spam"
    ]
  },
  {
    step: 2,
    id: "reviewed",
    title: "Reviewed & Verified",
    subtitle: "Simple photo check & privacy safety",
    icon: BadgeCheck,
    badgeColor: "bg-accent-pink text-foreground",
    statusText: "Status: Verified & Address Protected",
    statusBadge: "Checked",
    description: "Snap a quick photo. The reloved team verifies condition while shielding your phone number and exact residential address.",
    benefits: [
      "Residential address stays 100% confidential",
      "Item condition verified for safety",
      "Instant listing on Wall of Kindness"
    ]
  },
  {
    step: 3,
    id: "matched",
    title: "Partner Allocation",
    subtitle: "Matched with checked local NGOs",
    icon: HeartHandshake,
    badgeColor: "bg-accent-pink text-foreground",
    statusText: "Status: Allocated to Partner Hub",
    statusBadge: "Matched",
    description: "Items are routed directly to verified local community centers, schools, or shelters across Mumbai based on real community need.",
    benefits: [
      "Zero-cost distribution to verified needs",
      "Coordinated safe pick-up & drop-off",
      "Dignified, respectful handover"
    ]
  },
  {
    step: 4,
    id: "reloved",
    title: "Loved Again",
    subtitle: "Item received & impact logged",
    icon: Recycle,
    badgeColor: "bg-accent-green text-foreground",
    statusText: "Status: Reloved & Impact Confirmed",
    statusBadge: "Loved Again",
    description: "The item finds a happy second life! Donors receive a digital completion notification confirming their gift safely arrived.",
    benefits: [
      "Receive official completion update notification",
      "Track your personal kindness contributions",
      "Enjoy knowing your preloved item is cherished"
    ]
  }
]

// Kept quiet on purpose since a dense stepper UI sits on top of whichever
// one is active - but bright enough that a lighter wash still lets them read
// as something, rather than a moody/dark photo vanishing under the wash.
const LIFECYCLE_BACKDROPS = [
  { key: "oak-plank", label: "Photo A", url: "https://images.unsplash.com/photo-1597113366853-fea190b6cd82?w=2000&q=75&auto=format&fit=crop" },
  { key: "leaf-light", label: "Photo B", url: "https://images.unsplash.com/photo-1740993382990-0ee85287f759?w=2000&q=75&auto=format&fit=crop" },
  { key: "plaster", label: "Photo C", url: "https://images.unsplash.com/photo-1555181937-efe4e074a301?w=2000&q=75&auto=format&fit=crop" },
] as const

export function InteractiveLifecycle() {
  const [activeStepIndex, setActiveStepIndex] = useState(0)
  const [selectedItem, setSelectedItem] = useState<LifecycleItem>(SAMPLE_ITEMS[0])
  const [isPlaying, setIsPlaying] = useState(false)
  const backdrop = useSectionBackdrop(LIFECYCLE_BACKDROPS, "color", "white")

  // Auto playback effect
  useEffect(() => {
    let timer: NodeJS.Timeout
    if (isPlaying) {
      timer = setInterval(() => {
        setActiveStepIndex((prev) => (prev + 1) % LIFECYCLE_STEPS.length)
      }, 3500)
    }
    return () => clearInterval(timer)
  }, [isPlaying])

  const currentStep = LIFECYCLE_STEPS[activeStepIndex]

  return (
    <section className="py-12 md:py-20 bg-white border-b-2 border-foreground relative overflow-hidden">
      <BackdropLayer state={backdrop} wash="bg-white/70" />

      <div className="container px-4 mx-auto max-w-5xl relative z-10">
        
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-8 md:mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-accent-green text-foreground text-xs font-black uppercase tracking-widest mb-3 border-2 border-foreground shadow-[2px_2px_0px_rgba(0,0,0,1)]">
            <Sparkle size={14} className="fill-foreground" />
            <span>INTERACTIVE LIFECYCLE</span>
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-display font-black uppercase leading-tight tracking-tight mb-3">
            From "Unused at Home" to "Loved Again"
          </h2>
          <p className="text-sm md:text-base text-foreground-muted font-medium">
            Select a sample item to trace its transparent 4-stage reloved journey.
          </p>
        </div>

        {/* DIV 1: Compact Controller & Stepper Bar */}
        <div className="bg-surface-muted p-4 md:p-6 border-2 border-foreground shadow-[5px_5px_0px_rgba(0,0,0,1)] mb-6">
          {/* Top Control Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-4 border-b border-foreground/15">
            <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-full no-scrollbar">
              <span className="text-[11px] font-black uppercase tracking-wider text-foreground-muted shrink-0 mr-1 hidden sm:inline">
                Sample Item:
              </span>
              {SAMPLE_ITEMS.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSelectedItem(item)}
                  className={`px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider border-2 shrink-0 transition-all ${
                    selectedItem.id === item.id
                      ? "bg-foreground text-background border-foreground shadow-[2px_2px_0px_rgba(0,0,0,1)]"
                      : "bg-white text-foreground border-foreground/30 hover:border-foreground"
                  }`}
                >
                  {item.title}
                </button>
              ))}
            </div>

            <Button
              onClick={() => setIsPlaying(!isPlaying)}
              variant="outline"
              size="sm"
              className="h-8 px-3 rounded-none border-2 border-foreground bg-white text-xs font-bold uppercase tracking-wider shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all flex items-center gap-1.5 shrink-0"
            >
              {isPlaying ? <Pause size={13} /> : <Play size={13} />}
              <span>{isPlaying ? "Pause" : "Auto Play"}</span>
            </Button>
          </div>

          {/* 4-Step Stepper Tabs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {LIFECYCLE_STEPS.map((s, idx) => {
              const isActive = activeStepIndex === idx
              return (
                <button
                  key={s.id}
                  onClick={() => {
                    setActiveStepIndex(idx)
                    setIsPlaying(false)
                  }}
                  className={`p-2.5 md:p-3 border-2 text-left transition-all relative flex items-center gap-2 sm:gap-3 ${
                    isActive
                      ? "bg-white border-foreground shadow-[3px_3px_0px_rgba(0,0,0,1)] -translate-y-0.5"
                      : "bg-white/60 border-foreground/20 text-foreground/70 hover:border-foreground/50"
                  }`}
                >
                  <span className={`w-6 h-6 rounded-none shrink-0 text-[10px] font-black flex items-center justify-center border ${
                    isActive ? s.badgeColor : "bg-foreground/10 text-foreground"
                  }`}>
                    0{s.step}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h4 className="font-display font-black text-xs uppercase leading-tight truncate">
                      {s.title}
                    </h4>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* DIV 2: Unified Interactive Stage Card */}
        <div className="bg-white border-2 border-foreground p-4 md:p-6 shadow-[6px_6px_0px_rgba(0,0,0,1)] relative">
          <Tape className="-top-3 left-6" />

          <AnimatePresence mode="wait">
            <motion.div
              key={`${currentStep.id}-${selectedItem.id}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
              className="grid md:grid-cols-12 gap-6 items-center"
            >
              {/* Item Image Preview with Overlay */}
              <div className="md:col-span-5 relative">
                <div className="relative aspect-[4/3] w-full overflow-hidden border-2 border-foreground bg-surface-muted shadow-[3px_3px_0px_rgba(0,0,0,1)]">
                  <SafeImage
                    src={selectedItem.image}
                    alt={selectedItem.title}
                    className="w-full h-full object-cover"
                  />
                  
                  {/* Stage Visual Badge Overlay */}
                  <div className="absolute top-2 left-2 right-2 flex items-center justify-between">
                    <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 border border-foreground shadow-[1px_1px_0px_rgba(0,0,0,1)] ${currentStep.badgeColor}`}>
                      Stage 0{currentStep.step}: {currentStep.statusBadge}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 bg-white border border-foreground">
                      {selectedItem.category}
                    </span>
                  </div>

                  {/* Stage contextual badge over image */}
                  {currentStep.step === 1 && (
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex flex-col items-center justify-center text-white p-3 text-center">
                      <HomeIcon size={32} className="mb-1 text-white/90" />
                      <p className="font-display font-black text-base uppercase">Stored at Home</p>
                      <p className="text-[11px] text-white/80 mt-0.5">{selectedItem.donor} ({selectedItem.location})</p>
                    </div>
                  )}

                  {currentStep.step === 2 && (
                    <div className="absolute inset-0 bg-accent-blue/30 backdrop-blur-[1px] flex flex-col items-center justify-center text-white p-3 text-center">
                      <ShieldCheck size={36} className="mb-1 text-white" />
                      <p className="font-display font-black text-base uppercase tracking-wider text-white">RELOVED VERIFIED</p>
                      <p className="text-[10px] font-bold uppercase tracking-widest bg-black text-accent-green px-2 py-0.5 mt-1 border border-white">
                        Address Confidential
                      </p>
                    </div>
                  )}

                  {currentStep.step === 3 && (
                    <div className="absolute inset-0 bg-accent-yellow/30 backdrop-blur-[1px] flex flex-col items-center justify-center text-foreground p-3 text-center">
                      <HeartHandshake size={36} className="mb-1 text-foreground" />
                      <p className="font-display font-black text-base uppercase bg-white border-2 border-black px-2.5 py-0.5 shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                        Matched with Partner
                      </p>
                    </div>
                  )}

                  {currentStep.step === 4 && (
                    <div className="absolute inset-0 bg-accent-green/30 backdrop-blur-[1px] flex flex-col items-center justify-center text-foreground p-3 text-center">
                      <FreeStamp className="scale-110 mb-2" />
                      <p className="font-display font-black text-xl uppercase text-foreground bg-accent-green border-2 border-black px-3 py-0.5 shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                        LOVED AGAIN!
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Stage Details & Control */}
              <div className="md:col-span-7 flex flex-col justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[11px] font-black uppercase tracking-wider text-accent-green bg-accent-green/10 px-2 py-0.5 border border-accent-green/30">
                      {currentStep.statusText}
                    </span>
                  </div>

                  <h3 className="font-display font-black text-xl md:text-2xl uppercase leading-tight mb-2 text-foreground">
                    {currentStep.title}
                  </h3>
                  
                  <p className="text-xs md:text-sm text-foreground/80 font-medium leading-relaxed mb-3">
                    {currentStep.description}
                  </p>

                  {/* Key Benefit Highlight Box */}
                  <div className="bg-surface-muted p-3 border border-foreground/30 flex items-start gap-2.5">
                    <CheckCircle2 size={16} className="text-accent-green shrink-0 mt-0.5" />
                    <p className="text-xs font-bold text-foreground leading-snug">
                      <span className="uppercase text-[10px] tracking-wider text-foreground-muted block mb-0.5">Key Safeguard & Benefit:</span>
                      {currentStep.benefits[0]}
                    </p>
                  </div>
                </div>

                {/* Navigation Buttons */}
                <div className="pt-3 border-t border-foreground/15 flex items-center justify-between gap-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-foreground-muted">
                    Stage {currentStep.step} of 4
                  </span>

                  <div className="flex items-center gap-2">
                    {currentStep.step > 1 && (
                      <Button
                        onClick={() => {
                          setActiveStepIndex(prev => prev - 1)
                          setIsPlaying(false)
                        }}
                        variant="outline"
                        size="sm"
                        className="h-8 px-3 rounded-none border-2 border-foreground bg-white text-xs font-bold uppercase tracking-wider shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
                      >
                        Prev
                      </Button>
                    )}

                    {currentStep.step < 4 ? (
                      <Button
                        onClick={() => {
                          setActiveStepIndex(prev => prev + 1)
                          setIsPlaying(false)
                        }}
                        size="sm"
                        className="h-8 px-4 rounded-none border-2 border-foreground bg-accent-pink text-foreground hover:bg-accent-pink text-xs font-black uppercase tracking-wider shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all flex items-center gap-1.5"
                      >
                        <span>Next Stage</span>
                        <ArrowRight size={14} />
                      </Button>
                    ) : (
                      <Link to="/give">
                        <Button
                          size="sm"
                          className="h-8 px-4 rounded-none border-2 border-foreground bg-accent-pink text-foreground hover:bg-accent-pink text-xs font-black uppercase tracking-wider shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all flex items-center gap-1.5"
                        >
                          <span>Drop Item Now</span>
                          <ArrowRight size={14} />
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

      </div>
    </section>
  )
}
