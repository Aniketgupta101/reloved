import { Outlet, useLocation } from "react-router-dom"
import { Navbar } from "./Navbar"
import { Footer } from "./Footer"
import { CourtyardWallBackground } from "@/components/assets/CourtyardWallBackground"
import { FloatingHelpButton } from "@/components/sections/FloatingHelpButton"
import { MainSiteBanner, isTestingHost, MAIN_SITE_BANNER_H } from "./MainSiteBanner"
import { cn } from "@/lib/utils"
import "./public-experience.css"

export function PublicLayout() {
  const { pathname } = useLocation()
  const testingHost = isTestingHost()
  // Explicit route opt-in keeps auth/onboarding, ops and the recovery 404 out.
  const publicExperience = pathname === "/" || [
    /^\/(?:drop|wall|track)(?:\/[^/]+)?\/?$/,
    /^\/give(?:\/success\/[^/]+)?\/?$/,
    /^\/account(?:\/(?:claims|gifts)\/[^/]+)?\/?$/,
    /^\/(?:love|map|about|standards|privacy|terms|contact|faq|partner|qr)\/?$/,
  ].some(route => route.test(pathname))
  const isCourtyard =
    pathname === "/" ||
    pathname === "/drop" ||
    pathname === "/wall" ||
    pathname === "/love" ||
    pathname.startsWith("/drop/") ||
    pathname.startsWith("/wall/")

  // Hide on FAQ and on form-heavy pages where the FAB covers primary actions on mobile.
  const hideHelpButton =
    pathname === "/faq" ||
    pathname.startsWith("/account") ||
    pathname.startsWith("/give") ||
    pathname === "/contact" ||
    /^\/partner\/?$/.test(pathname) ||
    pathname.startsWith("/partner/login")

  return (
    <div className={cn("min-h-[100dvh] flex flex-col relative bg-transparent text-foreground font-sans antialiased overflow-x-hidden", publicExperience && "public-experience")}>
      <CourtyardWallBackground variant={isCourtyard ? "courtyard" : "paper"} />

      <div className="relative z-10 flex flex-col min-h-[100dvh] w-full">
        <MainSiteBanner />
        <Navbar publicExperience={publicExperience} />
        {/* Home hero is a full-viewport wall photo that must start at y=0
            (behind the floating navbar). Other pages keep mt-24 so content
            clears the fixed header. */}
        {/* Fixed navbar clearance: tighter on phones, full on sm+. Home hero
            paints behind the bar, so it keeps its own pt-* instead. */}
        <main
          className={cn(
            "flex-1 w-full min-w-0 overflow-x-hidden",
            publicExperience && pathname !== "/" && "public-main-spaced",
            pathname !== "/" &&
              "mt-[calc(3rem+env(safe-area-inset-top,0px))] sm:mt-[calc(4.5rem+env(safe-area-inset-top,0px))]",
          )}
          style={
            pathname !== "/" && testingHost
              ? { marginTop: `calc(${publicExperience ? "var(--public-header-height)" : "3rem"} + ${MAIN_SITE_BANNER_H} + env(safe-area-inset-top, 0px))` }
              : undefined
          }
        >
          <Outlet />
        </main>
        <Footer publicExperience={publicExperience} />
      </div>

      {!hideHelpButton && <FloatingHelpButton />}
    </div>
  )
}
