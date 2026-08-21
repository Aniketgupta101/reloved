import { useEffect, useState } from "react"
import { motion } from "motion/react"
import { Tape, FreeStamp } from "@/components/assets/RelovedAssets"
import { GraffitiWallBackground } from "@/components/sections/GraffitiWallBackground"
import { SafeImage } from "@/components/ui/SafeImage"
import { api } from "@/lib/api"
import { MOCK_ITEMS } from "@/lib/seed"
import { Heart, Sparkles, ArrowRight } from "lucide-react"
import { Link } from "react-router-dom"

const KIDS_HAPPY_IMAGES = [
  "https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=800&auto=format&fit=crop&q=80", // Happy child holding athletic gear/shoes
  "https://images.unsplash.com/photo-1509062522246-3755977927d7?w=800&auto=format&fit=crop&q=80", // Smiling student with learning books
  "https://images.unsplash.com/photo-1471286174890-9c112ffca5b4?w=800&auto=format&fit=crop&q=80", // Joyful child wearing warm clothes
  "https://images.unsplash.com/photo-1502086223501-7ea6ecd79368?w=800&auto=format&fit=crop&q=80", // Kid with backpack/toys outdoors
  "https://images.unsplash.com/photo-1542810634-71277d95dcbb?w=800&auto=format&fit=crop&q=80", // Happy kids group with gifts
  "https://images.unsplash.com/photo-1516627145497-ae6968895b74?w=800&auto=format&fit=crop&q=80"  // Joyful smiling child
]

export function WallOfLoveSection() {
  const [completedItems, setCompletedItems] = useState<any[]>([])

  useEffect(() => {
    async function fetchCompleted() {
      try {
        const { items } = await api.get<{ items: any[] }>("/api/items?status=reloved")
        if (items.length > 0) {
          setCompletedItems(items)
        } else {
          const mockReloved = MOCK_ITEMS.filter(i => i.public_status === 'reloved')
          setCompletedItems(mockReloved)
        }
      } catch (err) {
        const mockReloved = MOCK_ITEMS.filter(i => i.public_status === 'reloved')
        setCompletedItems(mockReloved)
      }
    }
    fetchCompleted()
  }, [])

  // Sample community recognition cards with joyful recipient photos
  const communityNotes = [
    { 
      name: "Priya S.", 
      item: "Athletic Running Shoes", 
      locality: "Colaba", 
      message: "Pass on with warmth! Seeing the joy on these little faces makes it all worth it.", 
      date: "Completed",
      image: "https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=800&auto=format&fit=crop&q=80"
    },
    { 
      name: "Rahul M.", 
      item: "Warm Winter Sweaters", 
      locality: "Malad", 
      message: "Glad these sweaters keep another young family warm through the winter.", 
      date: "Completed",
      image: "https://images.unsplash.com/photo-1471286174890-9c112ffca5b4?w=800&auto=format&fit=crop&q=80"
    },
    { 
      name: "Anonymous Donor", 
      item: "Children's Book Set", 
      locality: "Bandra", 
      message: "Given freely with kindness for eager young readers.", 
      date: "Completed",
      image: "https://images.unsplash.com/photo-1509062522246-3755977927d7?w=800&auto=format&fit=crop&q=80"
    }
  ]

  return (
    <section className="py-24 bg-surface-muted relative border-y-2 border-foreground overflow-hidden">
      {/* Authentic Graffiti Art Wall Background */}
      <GraffitiWallBackground />

      <div className="container px-4 relative z-10 mx-auto">
        <div className="max-w-4xl mb-12">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 bg-black text-white text-xs font-black uppercase tracking-widest mb-4 border border-black shadow-[3px_3px_0px_rgba(0,0,0,1)]">
            <Heart size={14} className="text-accent-red fill-accent-red" />
            <span>COMMUNITY DONOR RECOGNITION & IMPACT</span>
          </div>
          
          <h2 className="text-5xl md:text-7xl font-display font-black uppercase mb-4 leading-[0.9] text-foreground">
            Wall of Love
          </h2>
          
          <p className="text-xl md:text-2xl text-foreground font-medium mb-4 max-w-2xl">
            Celebrating real stories of preloved gifts bringing smiles, warmth, and hope to local children.
          </p>

          <div className="bg-white/95 backdrop-blur-sm border-2 border-foreground p-5 shadow-[6px_6px_0px_rgba(0,0,0,1)] max-w-2xl mb-8">
            <span className="text-xs font-black uppercase tracking-widest text-foreground-muted block mb-2">
              Donor Recognition Choices
            </span>
            <ul className="flex flex-wrap gap-4 text-xs font-bold uppercase tracking-wider">
              <li className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-accent-blue" /> Show my first name</li>
              <li className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-accent-green" /> Recognise me anonymously</li>
              <li className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-foreground" /> Do not display publicly</li>
            </ul>
          </div>
        </div>

        {/* Cards Placed on the Graffiti Wall */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {completedItems.map((item, idx) => {
            const kidImage = KIDS_HAPPY_IMAGES[idx % KIDS_HAPPY_IMAGES.length]

            return (
              <motion.div
                key={item.id || idx}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                className="bg-white border-2 border-foreground p-4 shadow-[6px_6px_0px_rgba(0,0,0,1)] relative flex flex-col justify-between group hover:translate-y-[-4px] transition-transform"
              >
                <Tape className="-top-3 left-1/2 -translate-x-1/2 rotate-1" />
                <FreeStamp className="absolute -bottom-3 -right-3 scale-75 z-20" />
                
                <div>
                  <div className="relative aspect-square border-2 border-foreground mb-3 overflow-hidden bg-surface-muted">
                    <SafeImage 
                      src={kidImage} 
                      alt={`Happy recipient of ${item.title}`} 
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" 
                    />
                    <div className="absolute top-2 right-2 bg-accent-pink text-foreground font-black text-[10px] px-2 py-0.5 border border-foreground uppercase tracking-widest shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                      RELOVED &bull; GIFTED
                    </div>
                  </div>

                  <h3 className="font-display font-black text-lg uppercase leading-tight mb-1">
                    {item.title}
                  </h3>
                  <p className="text-xs font-bold text-accent-blue uppercase tracking-wider mb-2">
                    Gifted with love in {item.locality}
                  </p>
                </div>

                <div className="pt-3 border-t-2 border-foreground/10 mt-2 flex justify-between items-center text-[10px] font-mono text-foreground-muted uppercase font-bold">
                  <span>Donor Recognized</span>
                  <span className="text-accent-green font-black">100% FREE</span>
                </div>
              </motion.div>
            )
          })}

          {communityNotes.map((note, idx) => (
            <motion.div
              key={`note-${idx}`}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              className="bg-accent-yellow/20 border-2 border-foreground p-4 shadow-[6px_6px_0px_rgba(0,0,0,1)] relative flex flex-col justify-between"
            >
              <Tape className="-top-3 left-1/2 -translate-x-1/2 -rotate-2" />
              <div>
                <div className="flex items-center gap-2 text-accent-red mb-2">
                  <Heart size={16} className="fill-accent-red" />
                  <span className="text-xs font-black uppercase tracking-widest">Community Impact</span>
                </div>

                <div className="relative aspect-[4/3] border-2 border-foreground mb-3 overflow-hidden bg-surface-muted">
                  <SafeImage 
                    src={note.image} 
                    alt={`Happy recipient for ${note.item}`} 
                    className="w-full h-full object-cover" 
                  />
                  <div className="absolute bottom-2 left-2 bg-white/90 backdrop-blur-xs text-foreground font-black text-[9px] px-1.5 py-0.5 border border-foreground uppercase tracking-wider shadow-[1px_1px_0px_rgba(0,0,0,1)]">
                    {note.item}
                  </div>
                </div>

                <p className="font-display font-black text-sm uppercase text-foreground mb-2 leading-snug">
                  “{note.message}”
                </p>
              </div>

              <div className="pt-2 border-t-2 border-foreground/10 mt-2 flex justify-between items-center text-[10px] font-mono font-bold uppercase">
                <span>{note.name} ({note.locality})</span>
                <span className="bg-foreground text-white px-1.5 py-0.5">{note.date}</span>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <Link to="/love" className="inline-flex items-center gap-2 px-6 py-3.5 bg-white border-2 border-foreground font-black uppercase text-sm shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all">
            <span>View Full Wall of Love</span>
            <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </section>
  )
}
