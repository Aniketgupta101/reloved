import { Outlet, useLocation } from "react-router-dom"
import { Navbar } from "./Navbar"
import { Footer } from "./Footer"
import { GraffitiBackground } from "@/components/assets/GraffitiBackground"
import { cn } from "@/lib/utils"

export function PublicLayout() {
  const { pathname } = useLocation()
  const isHome = pathname === "/"

  return (
    <div className="min-h-[100dvh] flex flex-col relative bg-background text-foreground font-sans antialiased overflow-x-hidden">
      {/* Dynamic Graffiti Plaster Wall Background */}
      {!isHome && <GraffitiBackground />}
      
      {/* Content Layer */}
      <div className="relative z-10 flex flex-col min-h-[100dvh] w-full">
        <Navbar />
        {/* Home hero is a full-viewport wall photo that must start at y=0
            (behind the floating navbar). Other pages keep mt-24 so content
            clears the fixed header. */}
        <main className={cn("flex-1 w-full", !isHome && "mt-24")}>
          <Outlet />
        </main>
        <Footer />
      </div>
    </div>
  )
}
