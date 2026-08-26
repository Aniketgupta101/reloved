import React, { useState } from "react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Textarea } from "@/components/ui/Textarea"
import { api } from "@/lib/api"
import { CheckCircle2, ShieldCheck, Heart, Send, ArrowRight } from "lucide-react"
import { KindnessMap } from "@/components/sections/KindnessMap"

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
    requiredCategories: ["Clothing"],
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
      setSubmittedRef(reference)
    } catch (err: any) {
      console.error("Partner submission error:", err)
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
            <Link to="/drop" className="flex-1">
              <Button className="w-full border-2 border-foreground rounded-none font-black uppercase tracking-widest shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] bg-accent-green text-foreground hover:bg-accent-green">
                Explore Wall of Kindness
              </Button>
            </Link>
            <Link to="/" className="flex-1">
              <Button className="w-full border-2 border-foreground rounded-none font-black uppercase tracking-widest bg-accent-pink text-foreground hover:bg-accent-pink shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px]">
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
        <div className="inline-block bg-accent-blue text-white text-xs font-black uppercase tracking-widest px-3 py-1 mb-4 border-2 border-foreground shadow-[2px_2px_0px_rgba(0,0,0,1)]">
          VERIFIED DISTRIBUTION NETWORK
        </div>
        <h1 className="text-5xl md:text-6xl font-display font-black uppercase leading-tight mb-4">Partner with reloved.</h1>
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
              <Input
                value={formData.locality}
                onChange={(e) => setFormData({ ...formData, locality: e.target.value })}
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
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+91 98765 43210"
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
              {["Clothing", "Footwear", "Books & Learning", "Home", "Art & Hobby", "Accessories"].map((cat) => {
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
            disabled={isSubmitting}
            className="h-14 text-base font-black uppercase tracking-widest border-2 border-foreground rounded-none shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all bg-accent-green text-foreground hover:bg-accent-green mt-2"
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
      setSubmitted(true)
      setFormData({ name: "", email: "", phone: "", subject: "", message: "" })
    } catch (err: any) {
      console.error("Contact message error:", err)
      setErrorMsg(err?.message || "Unable to send message. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-16">
      <div className="mb-12 text-center flex flex-col items-center">
        <h1 className="text-5xl font-display font-black uppercase tracking-tight mb-3">Contact us</h1>
        <p className="text-lg text-foreground-muted font-medium max-w-md">
          Have a question or feedback regarding the reloved digital Wall of Kindness initiative? Reach out to our community team.
        </p>
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
              onClick={() => setSubmitted(false)}
              className="border-2 border-foreground rounded-none font-black uppercase tracking-widest bg-accent-pink text-foreground hover:bg-accent-pink shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] mt-2"
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
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+91 98765 43210"
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
              disabled={isSubmitting}
              className="h-14 text-base font-black uppercase tracking-widest border-2 border-foreground rounded-none shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all bg-accent-pink text-foreground hover:bg-accent-pink"
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
          THE ORIGIN
        </div>
        <h1 className="text-5xl md:text-6xl font-display font-black uppercase tracking-tight leading-[0.95]">Our Story.</h1>

        <p className="text-lg leading-relaxed text-foreground/80 font-medium">
          RE-LOVED was inspired by the simple idea behind the Wall of Kindness — <span className="italic">Neki Ki Deewar</span> — which began on the streets of Iran.
        </p>

        <div className="border-2 border-foreground bg-accent-pink/25 p-6 md:p-8 flex flex-col gap-1 items-start">
          <span className="text-2xl md:text-3xl font-display font-black uppercase leading-tight">Leave what you don&rsquo;t need.</span>
          <span className="text-2xl md:text-3xl font-display font-black uppercase leading-tight">Claim what you do.</span>
        </div>

        <p className="text-lg leading-relaxed text-foreground/80 font-medium">
          Physical streets face limitations today. We built RE-LOVED to bring this humanitarian movement into the digital age — a place where clothes, shoes and bags can move from one person to another, with kindness.
        </p>

        <p className="text-xl font-display font-black uppercase text-foreground border-l-4 border-accent-green pl-4 py-1">
          No money. No judgement. Just giving, receiving, and giving something a second life.
        </p>
      </div>

      {/* Closing statement */}
      <div className="border-2 border-foreground bg-foreground text-white p-8 md:p-12 shadow-[8px_8px_0px_rgba(0,0,0,1)] flex flex-col items-center text-center gap-3">
        <p className="text-2xl md:text-3xl font-display font-black italic">
          “Because preloved only costs kindness.”
        </p>
        <div className="w-16 h-0.5 bg-accent-pink my-2" />
        <p className="text-sm font-black uppercase tracking-widest text-white/80">Welcome to Re-Loved</p>
        <p className="text-3xl md:text-4xl font-display font-black uppercase leading-tight">The Digital Wall of Kindness.</p>
      </div>

      {/* Impact Map — moved here from the homepage: "we do not need it
          right here... we can have it in Our Story." */}
      <KindnessMap />

      {/* CTA */}
      <div className="flex flex-col sm:flex-row gap-4">
        <Link to="/drop" className="flex-1">
          <Button className="w-full h-14 text-base border-2 border-foreground rounded-none font-black uppercase tracking-widest bg-accent-pink text-foreground hover:bg-accent-pink shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all flex items-center justify-center gap-2">
            <span>Explore the Wall</span>
            <ArrowRight size={18} />
          </Button>
        </Link>
        <Link to="/give" className="flex-1">
          <Button className="w-full h-14 text-base border-2 border-foreground rounded-none font-black uppercase tracking-widest bg-accent-green text-foreground hover:bg-accent-green shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all flex items-center justify-center gap-2">
            <Heart size={18} />
            <span>Drop an Item</span>
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
    <div className="max-w-4xl mx-auto px-4 py-16 flex flex-col gap-8">
      <div className="border-2 border-foreground bg-white p-8 md:p-12 shadow-[8px_8px_0px_rgba(0,0,0,1)] flex flex-col gap-6">
        <h1 className="text-4xl font-display font-black uppercase">Privacy Policy</h1>
        <p className="text-lg text-foreground/80 font-medium leading-relaxed">
          We protect the dignity and privacy of both givers and receivers. Exact residential pickup addresses are never made public. Beneficiary photos are strictly handled with institutional partner consent.
        </p>
      </div>
    </div>
  )
}

export function Terms() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-16 flex flex-col gap-8">
      <div className="border-2 border-foreground bg-white p-8 md:p-12 shadow-[8px_8px_0px_rgba(0,0,0,1)] flex flex-col gap-6">
        <h1 className="text-4xl font-display font-black uppercase">Terms of Service</h1>
        <p className="text-lg text-foreground/80 font-medium leading-relaxed">
          By using reloved, you confirm that any item you give is provided 100% free of charge without commercial intent, and complies with our community quality standards.
        </p>
      </div>
    </div>
  )
}
