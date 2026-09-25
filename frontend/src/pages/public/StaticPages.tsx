import React, { useState } from "react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { AddressAutocomplete } from "@/components/ui/AddressAutocomplete"
import { Textarea } from "@/components/ui/Textarea"
import { api } from "@/lib/api"
import { CheckCircle2, ShieldCheck, Send, ArrowUpRight, ArrowDownLeft, Plus } from "lucide-react"
import { HelpCta } from "@/components/sections/HelpCta"
import { FAQ_GROUPS, extractText, type FaqItem } from "@/data/faqContent"
import { AnalyticsEvent, track } from "@/lib/analytics"

export function Partner() {
  const [formData, setFormData] = useState({
    orgName: "",
    orgType: "NGO",
    registrationStatus: "Registered NGO",
    contactPerson: "",
    role: "",
    phone: "",
    email: "",
    locality: "",
    beneficiaryGroup: "",
    requiredCategories: ["Tops"],
    approxQuantity: "",
    message: "",
    consent: false,
  })

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submittedRef, setSubmittedRef] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const handleCategoryToggle = (cat: string) => {
    setFormData((prev) => {
      const exists = prev.requiredCategories.includes(cat)
      if (exists) {
        return { ...prev, requiredCategories: prev.requiredCategories.filter((c) => c !== cat) }
      } else {
        return { ...prev, requiredCategories: [...prev.requiredCategories, cat] }
      }
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.orgName || !formData.contactPerson || !formData.phone || !formData.email || !formData.consent) {
      setErrorMsg("Please fill in all required fields and accept the partner pledge.")
      return;
    }

    setIsSubmitting(true)
    setErrorMsg(null)

    try {
      const { reference } = await api.post<{ reference: string }>("/api/partner-applications", formData)
      track(AnalyticsEvent.partnerApplicationSubmitted, { reference })
      setSubmittedRef(reference)
    } catch (err: any) {
      console.error("Partner submission error:", err)
      track(AnalyticsEvent.partnerApplicationFailed)
      setErrorMsg(err?.message || "Failed to submit application. Please check your network and try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (submittedRef) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <div className="bg-white border-2 border-foreground p-8 md:p-12 shadow-[8px_8px_0px_rgba(0,0,0,1)] flex flex-col items-center gap-6">
          <div className="w-16 h-16 bg-accent-green border-2 border-foreground flex items-center justify-center text-foreground shadow-[4px_4px_0px_rgba(0,0,0,1)]">
            <CheckCircle2 size={36} className="stroke-[3]" />
          </div>
          <h1 className="text-4xl font-display font-black uppercase">Application Received</h1>
          <div className="bg-surface-muted border-2 border-foreground p-4 w-full text-center">
            <span className="text-xs uppercase font-bold tracking-widest text-foreground-muted block mb-1">Your Application Reference</span>
            <span className="text-2xl font-mono font-black text-foreground">{submittedRef}</span>
          </div>
          <p className="text-foreground/80 font-medium leading-relaxed">
            Thank you for applying to join reloved's network of verified distribution partners. Our community team will review your details and reach out within 48 hours to complete verification.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 w-full mt-4">
            <Link to="/drop" className="flex-1" onClick={() => track(AnalyticsEvent.ctaExploreWall, { source: "partner_apply_success" })}>
              <Button variant="cta" className="w-full font-black uppercase tracking-widest">
                Explore Wall of Kindness
              </Button>
            </Link>
            <Link to="/" className="flex-1" onClick={() => track(AnalyticsEvent.navLink, { label: "Home", path: "/", source: "partner_apply_success" })}>
              <Button variant="cta" className="w-full font-black uppercase tracking-widest">
                Back to Home
              </Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-16">
      <div className="mb-12 text-center flex flex-col items-center">
        <div className="inline-block bg-accent-pink text-foreground text-xs font-black uppercase tracking-widest px-3 py-1 mb-4 border-2 border-foreground shadow-[2px_2px_0px_rgba(0,0,0,1)]">
          VERIFIED DISTRIBUTION NETWORK
        </div>
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-display font-black uppercase leading-tight mb-4 text-balance">Partner with reloved.</h1>
        <p className="text-xl text-foreground-muted max-w-2xl font-medium leading-relaxed">
          We work with verified NGOs, schools, shelters, ashrams, and community initiatives to allocate free preloved goods to genuine beneficiaries with full dignity and zero cost.
        </p>
      </div>

      <div className="bg-white border-2 border-foreground p-6 md:p-10 shadow-[8px_8px_0px_rgba(0,0,0,1)]">
        <h2 className="text-2xl font-display font-black uppercase mb-6 pb-4 border-b-2 border-foreground">
          Partner Application Form
        </h2>

        {errorMsg && (
          <div className="bg-red-50 border-2 border-accent-red p-4 mb-6 font-bold text-accent-red text-sm">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-black uppercase tracking-widest text-foreground">Organisation Name *</label>
              <Input
                value={formData.orgName}
                onChange={(e) => setFormData({ ...formData, orgName: e.target.value })}
                placeholder="e.g. Hope Foundation Mumbai"
                maxLength={160}
                className="rounded-none border-2 border-foreground"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-black uppercase tracking-widest text-foreground">Organisation Type *</label>
              <select
                value={formData.orgType}
                onChange={(e) => setFormData({ ...formData, orgType: e.target.value })}
                className="h-10 border-2 border-foreground rounded-none bg-background px-3 text-sm font-medium"
              >
                <option value="NGO">Registered NGO / Trust</option>
                <option value="School">School / Educational Trust</option>
                <option value="Shelter">Shelter / Care Home</option>
                <option value="Community Group">Community Initiative</option>
                <option value="Ashram">Ashram / Welfare Center</option>
                <option value="Other">Other Community Org</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-black uppercase tracking-widest text-foreground">Registration Status *</label>
              <select
                value={formData.registrationStatus}
                onChange={(e) => setFormData({ ...formData, registrationStatus: e.target.value })}
                className="h-10 border-2 border-foreground rounded-none bg-background px-3 text-sm font-medium"
              >
                <option value="Registered NGO">Registered 80G / 12A / Society</option>
                <option value="Trust">Registered Trust</option>
                <option value="Unregistered">Informal Community Group</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-black uppercase tracking-widest text-foreground">Broad Locality / Area *</label>
              <AddressAutocomplete
                value={formData.locality}
                onChange={(val) => setFormData({ ...formData, locality: val })}
                placeholder="e.g. Dharavi, Kurla, Malad West"
                className="rounded-none border-2 border-foreground"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-black uppercase tracking-widest text-foreground">Contact Person *</label>
              <Input
                value={formData.contactPerson}
                onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                placeholder="Full Name"
                maxLength={120}
                className="rounded-none border-2 border-foreground"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-black uppercase tracking-widest text-foreground">Role / Designation</label>
              <Input
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                placeholder="e.g. Program Manager, Director"
                className="rounded-none border-2 border-foreground"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-black uppercase tracking-widest text-foreground">Mobile Phone Number *</label>
              <Input
                type="tel"
                inputMode="numeric"
                maxLength={10}
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                placeholder="98765 43210"
                className="rounded-none border-2 border-foreground"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-black uppercase tracking-widest text-foreground">Email Address *</label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="partner@org.in"
                className="rounded-none border-2 border-foreground"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-black uppercase tracking-widest text-foreground">Beneficiary Group Served</label>
              <Input
                value={formData.beneficiaryGroup}
                onChange={(e) => setFormData({ ...formData, beneficiaryGroup: e.target.value })}
                placeholder="e.g. Primary school children, elderly, families"
                className="rounded-none border-2 border-foreground"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-black uppercase tracking-widest text-foreground">Approx. Monthly Item Need</label>
              <Input
                value={formData.approxQuantity}
                onChange={(e) => setFormData({ ...formData, approxQuantity: e.target.value })}
                placeholder="e.g. 50-100 clothing items, 20 book sets"
                className="rounded-none border-2 border-foreground"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-black uppercase tracking-widest text-foreground">Most Needed Categories</label>
            <div className="flex flex-wrap gap-2 pt-1">
              {["Outerwear", "Tops", "Bottoms", "Kicks", "Bags", "Accessories"].map((cat) => {
                const active = formData.requiredCategories.includes(cat)
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => handleCategoryToggle(cat)}
                    className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider border-2 border-foreground transition-all ${
                      active
                        ? "bg-foreground text-white shadow-[2px_2px_0px_rgba(0,0,0,1)]"
                        : "bg-white text-foreground hover:bg-black/5"
                    }`}
                  >
                    {active ? "✓ " : "+ "}
                    {cat}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-black uppercase tracking-widest text-foreground">Additional Notes / Overview</label>
            <Textarea
              value={formData.message}
              onChange={(e) => setFormData({ ...formData, message: e.target.value })}
              placeholder="Tell us briefly about your organization's work and distribution process."
              className="rounded-none border-2 border-foreground h-24"
            />
          </div>

          <label className="flex items-start gap-3 p-4 border-2 border-foreground bg-surface-muted cursor-pointer hover:bg-black/5">
            <input
              type="checkbox"
              checked={formData.consent}
              onChange={(e) => setFormData({ ...formData, consent: e.target.checked })}
              className="mt-1 w-5 h-5 rounded-none border-2 border-foreground text-foreground focus:ring-foreground"
            />
            <span className="text-xs font-bold leading-relaxed">
              I certify that our organization will distribute all allocated items 100% free of charge to genuine beneficiaries, with full respect for dignity and zero commercial resale.
            </span>
          </label>

          <Button
            type="submit"
            variant="cta"
            disabled={isSubmitting}
            className="h-14 text-base font-black uppercase tracking-widest mt-2"
          >
            {isSubmitting ? "Submitting Application..." : "Submit Partner Application"}
          </Button>
        </form>
      </div>
    </div>
  )
}

export function Contact() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    subject: "",
    message: "",
  })

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name || !formData.email || !formData.message) {
      setErrorMsg("Please fill in your name, email, and message.")
      return;
    }

    setIsSubmitting(true)
    setErrorMsg(null)

    try {
      await api.post("/api/contact", formData)
      track(AnalyticsEvent.contactSubmitted, { subject: formData.subject || "none" })
      setSubmitted(true)
      setFormData({ name: "", email: "", phone: "", subject: "", message: "" })
    } catch (err: any) {
      console.error("Contact message error:", err)
      track(AnalyticsEvent.contactFailed)
      setErrorMsg(err?.message || "Unable to send message. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-16">
      <div className="mb-12 text-center flex flex-col items-center">
        <h1 className="text-4xl sm:text-5xl font-display font-black uppercase tracking-tight mb-3 text-balance">Contact us</h1>
        <p className="text-lg text-foreground-muted font-medium max-w-md">
          Have a question or feedback regarding the reloved digital Wall of Kindness initiative? Reach out to our community team.
        </p>
        <p className="text-sm text-foreground-muted font-medium mt-2">
          Common question? Check the{" "}
          <Link to="/faq" className="underline font-bold text-foreground" onClick={() => track(AnalyticsEvent.footerLink, { label: "FAQs", path: "/faq", source: "contact_page" })}>FAQs</Link> first, you might get your answer faster.
        </p>
        <a
          href="tel:+919429397422"
          onClick={() => track(AnalyticsEvent.footerLink, { label: "Customer Care Phone", path: "tel:+919429397422", source: "contact_page" })}
          className="mt-6 inline-flex flex-col items-center gap-1 border-2 border-foreground bg-accent-green px-6 py-4 shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all"
        >
          <span className="text-xs font-black uppercase tracking-widest text-foreground">Customer care</span>
          <span className="text-2xl font-display font-black text-foreground">+91 94293 97422</span>
          <span className="text-xs font-medium text-foreground/70">Reloved public line — your personal number stays private</span>
        </a>
      </div>

      <div className="bg-white border-2 border-foreground p-6 md:p-10 shadow-[8px_8px_0px_rgba(0,0,0,1)]">
        {submitted ? (
          <div className="flex flex-col items-center text-center gap-6 py-8">
            <div className="w-16 h-16 bg-accent-green border-2 border-foreground flex items-center justify-center text-foreground shadow-[4px_4px_0px_rgba(0,0,0,1)]">
              <CheckCircle2 size={36} className="stroke-[3]" />
            </div>
            <h2 className="text-3xl font-display font-black uppercase">Message Received</h2>
            <p className="text-foreground/80 font-medium max-w-md">
              Thank you for contacting reloved. Our team has received your message and will get back to you shortly.
            </p>
            <Button
              variant="cta"
              onClick={() => setSubmitted(false)}
              className="font-black uppercase tracking-widest mt-2"
            >
              Send Another Message
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            {errorMsg && (
              <div className="bg-red-50 border-2 border-accent-red p-4 font-bold text-accent-red text-sm">
                {errorMsg}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-black uppercase tracking-widest text-foreground">Your Name *</label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Full Name"
                  maxLength={120}
                  className="rounded-none border-2 border-foreground"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-black uppercase tracking-widest text-foreground">Email Address *</label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="name@domain.com"
                  className="rounded-none border-2 border-foreground"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-black uppercase tracking-widest text-foreground">Mobile Phone (Optional)</label>
                <Input
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                  placeholder="98765 43210"
                  className="rounded-none border-2 border-foreground"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-black uppercase tracking-widest text-foreground">Subject</label>
                <Input
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  placeholder="General Question / Feedback / Campaign"
                  className="rounded-none border-2 border-foreground"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-black uppercase tracking-widest text-foreground">Message *</label>
              <Textarea
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                placeholder="How can we help you?"
                className="rounded-none border-2 border-foreground h-32"
              />
            </div>

            <Button
              type="submit"
              variant="cta"
              disabled={isSubmitting}
              className="h-14 text-base font-black uppercase tracking-widest"
            >
              {isSubmitting ? "Sending Message..." : "Send Message"}
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}

export function About() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-16 flex flex-col gap-10">
      {/* Origin */}
      <div className="border-2 border-foreground bg-white p-8 md:p-12 shadow-[8px_8px_0px_rgba(0,0,0,1)] flex flex-col gap-6">
        <div className="inline-block bg-black text-white text-xs font-black uppercase tracking-widest px-3 py-1 w-fit border border-black shadow-[2px_2px_0px_rgba(0,0,0,1)]">
          THE SOUL OF RE-LOVED
        </div>
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-display font-black uppercase tracking-tight leading-[0.95] text-balance">Our Story.</h1>

        <p className="text-lg leading-relaxed text-foreground/80 font-medium">
          RE-LOVED was born from the beautiful spirit of the Wall of Kindness or <span className="italic">Neki Ki Deewar</span> which originated on the streets of Iran. A movement born out of pure empathy, with a simple, quiet promise:
        </p>

        <div className="border-2 border-foreground bg-accent-pink/25 p-6 md:p-8 flex flex-col gap-1 items-start">
          <span className="text-2xl md:text-3xl font-display font-black uppercase leading-tight">Leave what you no longer need.</span>
          <span className="text-2xl md:text-3xl font-display font-black uppercase leading-tight">Take what you do.</span>
        </div>

        <p className="text-lg leading-relaxed text-foreground/80 font-medium">
          We wanted to bring that exact heartbeat into the digital age.
        </p>

        <p className="text-lg leading-relaxed text-foreground/80 font-medium">
          Think about the pieces sitting quietly in the back of your wardrobe right now that once made you feel special, but now just collect dust. Those items still carry stories, memories, and so much life. They don&rsquo;t deserve to sit forgotten, and they certainly don&rsquo;t deserve to become waste.
        </p>

        <p className="text-lg leading-relaxed text-foreground/80 font-medium">
          Somewhere out there, someone is looking for exactly what you no longer wear.
        </p>

        <p className="text-lg leading-relaxed text-foreground/80 font-medium">
          So we built RE-LOVED. A premium digital space with zero cash, zero judgment, and absolute dignity. Just a direct circle of people gently passing things from one wardrobe to another.
        </p>

        <p className="text-lg leading-relaxed text-foreground/80 font-medium">
          When we choose to pass a piece on instead of buying something new, we breathe fresh life into it, protect the earth we walk on, and keep the circle moving.
        </p>

        <p className="text-xl font-display font-black uppercase text-foreground border-l-4 border-accent-green pl-4 py-1">
          Skip the transaction. Love the planet.
        </p>

        <p className="text-sm font-black uppercase tracking-[0.2em] text-foreground/70">
          ★ Preloved for free ★
        </p>
      </div>

      {/* Closing statement */}
      <div className="border-2 border-foreground bg-foreground text-white p-8 md:p-12 shadow-[8px_8px_0px_rgba(0,0,0,1)] flex flex-col items-center text-center gap-3">
        <p className="text-2xl md:text-3xl font-display font-black italic">
          “Skip the transaction. Love the planet.”
        </p>
        <div className="w-16 h-0.5 bg-accent-pink my-2" />
        <p className="text-sm font-black uppercase tracking-widest text-white/80">Welcome to Re-Loved</p>
        <p className="text-3xl md:text-4xl font-display font-black uppercase leading-tight">★ Preloved for free ★</p>
      </div>

      {/* CTA - primary Drop (black) + secondary Claim (outline) */}
      <div className="flex flex-col sm:flex-row gap-4">
        <Link to="/give" className="flex-1" onClick={() => track(AnalyticsEvent.ctaDropItem, { source: "about_page" })}>
          <Button variant="cta" className="w-full h-14 text-base font-black uppercase tracking-widest flex items-center justify-center gap-2">
            <span>Drop an item</span>
            <ArrowUpRight size={18} />
          </Button>
        </Link>
        <Link to="/drop" className="flex-1" onClick={() => track(AnalyticsEvent.ctaClaimItem, { source: "about_page" })}>
          <Button variant="outline" className="w-full h-14 text-base font-black uppercase tracking-widest flex items-center justify-center gap-2">
            <span>Claim an item</span>
            <ArrowDownLeft size={18} />
          </Button>
        </Link>
      </div>
    </div>
  )
}

export function Standards() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-16 flex flex-col gap-8">
      <div className="border-2 border-foreground bg-white p-8 md:p-12 shadow-[8px_8px_0px_rgba(0,0,0,1)] flex flex-col gap-6">
        <h1 className="text-4xl font-display font-black uppercase">Quality &amp; Safety Standards</h1>
        <p className="text-lg text-foreground/80 font-medium leading-relaxed">
          Every item given through reloved must be clean, safe, fully functional, and honestly represented.
        </p>

        <div className="bg-surface-muted border-2 border-foreground p-6 flex flex-col gap-4">
          <h3 className="font-display font-black uppercase text-xl text-accent-red">Strictly Prohibited Items:</h3>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm font-bold">
            <li className="flex items-center gap-2">❌ Materially torn or stained clothing</li>
            <li className="flex items-center gap-2">❌ Damaged or unsafe electronics</li>
            <li className="flex items-center gap-2">❌ Expired medicines or consumables</li>
            <li className="flex items-center gap-2">❌ Broken toys or missing essential parts</li>
            <li className="flex items-center gap-2">❌ Hazardous or illegal materials</li>
            <li className="flex items-center gap-2">❌ Unsanitized footwear or bedding</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

export function Privacy() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12 md:py-16 flex flex-col gap-8">
      <div className="border-2 border-foreground bg-white p-6 md:p-10 shadow-[8px_8px_0px_rgba(0,0,0,1)] flex flex-col gap-6">
        <p className="text-xs font-black uppercase tracking-widest text-foreground-muted">Last updated: 16 September 2026</p>
        <h1 className="text-3xl md:text-4xl font-display font-black uppercase">Privacy Policy</h1>
        <p className="text-base text-foreground/80 font-medium leading-relaxed">
          Reloved Digital is a product of Totem Interactive. Reloved operates a digital Wall of Kindness that helps people give and claim preloved items for free. This policy describes the personal information we collect on the Reloved website and how we use it.
        </p>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-display font-black uppercase">1. Information we collect</h2>
          <ul className="list-disc pl-5 text-sm text-foreground/80 space-y-1.5 leading-relaxed">
            <li>
              <span className="font-bold text-foreground">Account &amp; profile:</span> name, username, clothing preference (Men / Women / Girls / Boys), mobile, email, address type, address, and pincode.
            </li>
            <li>
              <span className="font-bold text-foreground">Drop submissions:</span> category, size, description, photos, handover preferences, Wall of Love recognition (name, username, or anonymous), and your quality / free-gift confirmation.
            </li>
            <li>
              <span className="font-bold text-foreground">Claim requests:</span> name, phone, handover address, optional note, personal-use / not-for-sale confirmation, and Terms &amp; Privacy acceptance.
            </li>
            <li>
              <span className="font-bold text-foreground">Coming-soon waitlist:</span> email and mobile (both required), name optional, and Donate / Claim preference. No OTP on waitlist.
            </li>
            <li>
              <span className="font-bold text-foreground">Verification:</span> email or SMS OTP when you sign in or change contact details on the main app.
            </li>
            <li>
              <span className="font-bold text-foreground">Technical:</span> basic device/browser and usage logs to run and secure the service. Uploaded photos may be compressed or processed for the Wall.
            </li>
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-display font-black uppercase">2. How we use information</h2>
          <ul className="list-disc pl-5 text-sm text-foreground/80 space-y-1.5 leading-relaxed">
            <li>To run Drop, Claim, tracking, account, and Wall of Kindness features.</li>
            <li>To verify contact details where OTP is required.</li>
            <li>To help droppers and claimers coordinate handovers (including notifications when a claim is requested, accepted, or declined) and to work with verified community partners when needed.</li>
            <li>To show matching / picked-for-you recommendations from your clothing preference.</li>
            <li>To enforce claim limits and remove claimed items from active Wall inventory.</li>
            <li>To contact you about submissions, claims, or launch updates you signed up for.</li>
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-display font-black uppercase">3. Sharing</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            We do not sell your personal data. Exact residential addresses are not published on the public Wall. We may share limited contact or handover details with verified logistics or community partners only as needed to complete a drop or claim. We use service providers (hosting, email/SMS, file storage) only to operate Reloved.
          </p>
          <p className="text-sm text-foreground/80 leading-relaxed">
            Claimed items are intended for personal use and must not be sold, traded, or used for commercial resale.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-display font-black uppercase">3a. Platform role, authenticity &amp; brands</h2>
          <ul className="list-disc pl-5 text-sm text-foreground/80 space-y-2 leading-relaxed">
            <li>
              Reloved does <span className="font-bold text-foreground">not</span> guarantee authenticity, brand originality, condition, quality, safety, or suitability of any item. Items are offered and claimed on an &quot;as is&quot; basis between users. Reloved is not responsible for disputes, loss, or claims arising from items or interactions between users.
            </li>
            <li>
              Reloved is a platform that facilitates the passing on of pre-loved items between users. Reloved does not sell, purchase, own, authenticate, or otherwise take title to the items listed by users.
            </li>
            <li>
              Brand names and trademarks displayed on Reloved belong to their respective owners and are used solely to identify products listed by users. Reloved is not affiliated with, sponsored by, or endorsed by those brand owners unless expressly stated.
            </li>
          </ul>
          <p className="text-sm text-foreground/80 leading-relaxed">
            Public listings show broad locality only; exact addresses are shared only when needed for handover.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-display font-black uppercase">4. Photos &amp; recognition</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            Item photos may appear on the Wall after review. Wall of Love recognition follows the preference you select. Photos that may include children are handled with care; parents or guardians may drop or claim items for children.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-display font-black uppercase">5. Retention &amp; security</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            We keep information as long as needed to operate Reloved, meet legal obligations, and resolve disputes, then delete or anonymise where practical. We use reasonable measures to protect data; no online service is perfectly secure.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-display font-black uppercase">6. Your choices</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            You may update profile details in your account where available. On Drop and Claim you must accept our Terms &amp; Privacy before submitting. To request access, correction, or deletion, email{" "}
            <a href="mailto:hello@reloved.digital" className="underline font-bold">hello@reloved.digital</a>.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-display font-black uppercase">7. Children</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            Reloved is for adults coordinating gifts. Parents or guardians may drop or claim items for children. If you believe we hold a child’s data inappropriately, contact us and we will review promptly.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-display font-black uppercase">8. Contact</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            Privacy questions: <a href="mailto:hello@reloved.digital" className="underline font-bold">hello@reloved.digital</a>.
          </p>
        </section>
      </div>
    </div>
  )
}

function FaqAccordionItem({ item, isOpen, onToggle }: { item: FaqItem; isOpen: boolean; onToggle: () => void }) {
  return (
    <div className="border-2 border-foreground bg-white">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-4 p-4 md:p-5 text-left"
      >
        <span className="font-display font-black uppercase text-sm md:text-base leading-snug">{item.q}</span>
        <span
          className={`shrink-0 w-7 h-7 flex items-center justify-center border-2 border-foreground transition-transform ${isOpen ? "rotate-45 bg-accent-pink" : "bg-white"}`}
        >
          <Plus size={14} className="stroke-[3]" />
        </span>
      </button>
      {isOpen && (
        <div className="px-4 md:px-5 pb-5 -mt-1 text-sm text-foreground/80 leading-relaxed font-medium">
          {item.a}
        </div>
      )}
    </div>
  )
}

export function Faq() {
  const [openKey, setOpenKey] = useState<string | null>(null)

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_GROUPS.flatMap((group) =>
      group.items.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: extractText(item.a) },
      }))
    ),
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-16 flex flex-col gap-10">
      <script type="application/ld+json">{JSON.stringify(faqJsonLd)}</script>
      <div className="text-center flex flex-col items-center gap-3">
        <div className="inline-block bg-accent-pink text-foreground text-xs font-black uppercase tracking-widest px-3 py-1 border-2 border-foreground shadow-[2px_2px_0px_rgba(0,0,0,1)]">
          GOT QUESTIONS?
        </div>
        <h1 className="text-4xl md:text-5xl font-display font-black uppercase tracking-tight">
          Frequently asked questions
        </h1>
        <p className="text-foreground-muted font-medium max-w-lg">
          Everything about dropping, claiming, and your account, straight from how reloved actually works.
        </p>
      </div>

      <div className="flex flex-col gap-10">
        {FAQ_GROUPS.map((group) => (
          <div key={group.title} className="flex flex-col gap-3">
            <h2 className="font-display font-black uppercase text-xl border-b-2 border-foreground pb-2">
              {group.title}
            </h2>
            <div className="flex flex-col gap-2">
              {group.items.map((item) => {
                const key = `${group.title}__${item.q}`
                return (
                  <FaqAccordionItem
                    key={key}
                    item={item}
                    isOpen={openKey === key}
                    onToggle={() => {
                      const nextOpen = openKey !== key
                      if (nextOpen) track(AnalyticsEvent.faqOpened, { question: item.q.slice(0, 120), group: group.title })
                      setOpenKey(nextOpen ? key : null)
                    }}
                  />
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <HelpCta source="faq" />
    </div>
  )
}

export function Terms() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12 md:py-16 flex flex-col gap-8">
      <div className="border-2 border-foreground bg-white p-6 md:p-10 shadow-[8px_8px_0px_rgba(0,0,0,1)] flex flex-col gap-6">
        <p className="text-xs font-black uppercase tracking-widest text-foreground-muted">Last updated: 16 September 2026</p>
        <h1 className="text-3xl md:text-4xl font-display font-black uppercase">Terms &amp; Conditions</h1>
        <p className="text-base text-foreground/80 font-medium leading-relaxed">
          These Terms govern use of Reloved (Drop, Claim, account, waitlist, and the Wall of Kindness). By using Reloved, or by clicking “I Accept” / checking the agreement box on Drop or Claim, you agree to these Terms and our Privacy Policy.
        </p>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-display font-black uppercase">1. What Reloved is</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            Reloved Digital is a product of Totem Interactive. Reloved is a digital Wall of Kindness that makes giving and claiming preloved items for free feel simple. Reloved is a platform that facilitates the passing on of pre-loved items between users. Reloved does not sell, purchase, own, authenticate, or otherwise take title to the items listed by users. We help catalogue items, connect people, and coordinate handovers with community partners where applicable.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-display font-black uppercase">2. Free - not for sale</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            Every item on Reloved is free. droppers confirm they are dropping freely without receiving payment. Claimants confirm the item is for personal use only and will not be sold, traded for money, or used commercially.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-display font-black uppercase">3. “As is” items &amp; authenticity</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            Items are offered and claimed on an “as is” basis. Users are responsible for ensuring that items they drop or claim are suitable and safe. Reloved does not guarantee the condition, authenticity, brand originality, quality, safety, or suitability of any item and is not responsible for any loss, damage, injury, dispute, or claim arising from items or interactions between users.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-display font-black uppercase">3a. Brands &amp; trademarks</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            Brand names and trademarks displayed on Reloved belong to their respective owners and are used solely to identify products listed by users. Reloved is not affiliated with, sponsored by, or endorsed by those brand owners unless expressly stated.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-display font-black uppercase">4. Quality &amp; safety</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            Items must be clean, safe, fully usable, and honestly represented - not materially torn or stained. Prohibited examples include damaged or unsafe electronics, expired medicines or consumables, broken toys missing essential parts, hazardous or illegal materials, and unsanitized footwear or bedding. See our{" "}
            <Link to="/standards" className="underline font-bold" onClick={() => track(AnalyticsEvent.footerLink, { label: "Quality Standards", path: "/standards", source: "terms" })}>Quality &amp; Safety Standards</Link>.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-display font-black uppercase">5. Drop &amp; Claim</h2>
          <ul className="list-disc pl-5 text-sm text-foreground/80 space-y-1.5 leading-relaxed">
            <li>Drop uses Men / Women / Girls / Boys audiences and categories such as Outerwear, Tops, Bottoms, Kicks, Bags, and Accessories.</li>
            <li>Individual claims are sent to the item&apos;s dropper, who may Accept or Decline. Accepted claims become Matched; if Declined, the claimer sees Couldn&apos;t match (never Rejected) and the item stays Available on the Wall.</li>
            <li>A weekly claim limit applies during Friends &amp; Family (currently up to two claims per calendar week). Partner / NGO allocations are a separate flow.</li>
            <li>Matched / Reloved items are removed from active Wall inventory so they cannot be claimed again.</li>
            <li>Some features require an account and may use email or SMS OTP. We may suspend access for misuse or safety reasons.</li>
            <li>Reloved facilitates matching. Couriers such as Porter or Borzo are external providers — Reloved does not fulfil delivery.</li>
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-display font-black uppercase">6. Your responsibilities</h2>
          <ul className="list-disc pl-5 text-sm text-foreground/80 space-y-1.5 leading-relaxed">
            <li>Provide accurate contact and item information.</li>
            <li>Only drop items that meet our quality and safety expectations.</li>
            <li>Do not misuse the platform (fraud, harassment, commercial resale, illegal items).</li>
            <li>Respect handover arrangements and the dropper&apos;s Accept / Decline decision.</li>
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-display font-black uppercase">7. Limitation of liability</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            To the fullest extent permitted by law, Reloved and its operators are not liable for indirect, incidental, or consequential damages, or for disputes between users relating to items, condition, delivery, or use. Our role is facilitation only.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-display font-black uppercase">8. Privacy</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            Personal data is handled as described in our{" "}
            <Link to="/privacy" className="underline font-bold" onClick={() => track(AnalyticsEvent.footerLink, { label: "Privacy", path: "/privacy", source: "terms" })}>Privacy Policy</Link>.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-display font-black uppercase">9. Changes</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            We may update these Terms. Continued use after changes means you accept the updated Terms. The “Last updated” date on this page will change when we do.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-display font-black uppercase">10. Contact</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">
            Questions: <a href="mailto:hello@reloved.digital" className="underline font-bold">hello@reloved.digital</a>.
          </p>
        </section>
      </div>
    </div>
  )
}
