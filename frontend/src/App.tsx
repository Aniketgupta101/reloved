import { BrowserRouter, Routes, Route } from "react-router-dom"
import { PublicLayout } from "@/components/layout/PublicLayout"
import { AdminLayout } from "@/components/layout/AdminLayout"
import { Home } from "@/pages/public/Home"
import { Drop } from "@/pages/public/Drop"
import { ItemDetail } from "@/pages/public/ItemDetail"
import { Give } from "@/pages/public/Give"
import { GiveSuccess } from "@/pages/public/GiveSuccess"
import { Track } from "@/pages/public/Track"
import { TrackDetail } from "@/pages/public/TrackDetail"
import { Love } from "@/pages/public/Love"
import { MapPage } from "@/pages/public/MapPage"
import { Partner, About, Standards, Privacy, Terms, Contact } from "@/pages/public/StaticPages"
import { DonorLogin } from "@/pages/public/DonorLogin"
import { DonorDashboard } from "@/pages/public/DonorDashboard"
import { DonorOnboarding } from "@/pages/public/DonorOnboarding"
import { PartnerLogin } from "@/pages/partner/PartnerLogin"
import { PartnerDashboard } from "@/pages/partner/PartnerDashboard"
import { AdminLogin } from "@/pages/admin/AdminLogin"
import { AdminDashboard } from "@/pages/admin/AdminDashboard"
import { AdminDonations } from "@/pages/admin/AdminDonations"
import { AdminItems } from "@/pages/admin/AdminItems"
import { AdminPartners } from "@/pages/admin/AdminPartners"
import { AdminNeeds } from "@/pages/admin/AdminNeeds"
import { AdminAllocations } from "@/pages/admin/AdminAllocations"
import { AdminMessages } from "@/pages/admin/AdminMessages"
import { AdminBulkUpload } from "@/pages/admin/AdminBulkUpload"
import { AdminItemRequests } from "@/pages/admin/AdminItemRequests"

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/drop" element={<Drop />} />
          <Route path="/wall" element={<Drop />} />
          <Route path="/drop/:slug" element={<ItemDetail />} />
          <Route path="/wall/:slug" element={<ItemDetail />} />
          <Route path="/give" element={<Give />} />
          <Route path="/give/success/:reference" element={<GiveSuccess />} />
          <Route path="/track" element={<Track />} />
          <Route path="/track/:reference" element={<TrackDetail />} />
          <Route path="/partner" element={<Partner />} />
          <Route path="/account/login" element={<DonorLogin />} />
          <Route path="/account/onboarding" element={<DonorOnboarding />} />
          <Route path="/account" element={<DonorDashboard />} />
          <Route path="/love" element={<Love />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/about" element={<About />} />
          <Route path="/standards" element={<Standards />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="*" element={
            <div className="text-center py-32 flex flex-col items-center justify-center gap-4">
              <h1 className="text-6xl font-black font-display uppercase">404</h1>
              <p className="text-lg font-medium">The page you requested was not found on the Wall of Kindness.</p>
              <a href="/" className="px-6 py-3 bg-accent-yellow border-2 border-foreground font-black uppercase text-sm shadow-[4px_4px_0px_rgba(0,0,0,1)]">Return Home</a>
            </div>
          } />
        </Route>

        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/partner/login" element={<PartnerLogin />} />
        <Route path="/partner/dashboard" element={<PartnerDashboard />} />
        
        <Route element={<AdminLayout />}>
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/donations" element={<AdminDonations />} />
          <Route path="/admin/items" element={<AdminItems />} />
          <Route path="/admin/bulk-upload" element={<AdminBulkUpload />} />
          <Route path="/admin/partners" element={<AdminPartners />} />
          <Route path="/admin/needs" element={<AdminNeeds />} />
          <Route path="/admin/allocations" element={<AdminAllocations />} />
          <Route path="/admin/item-requests" element={<AdminItemRequests />} />
          <Route path="/admin/messages" element={<AdminMessages />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
