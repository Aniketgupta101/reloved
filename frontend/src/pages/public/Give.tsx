import React, { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "motion/react"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { AddressAutocomplete } from "@/components/ui/AddressAutocomplete"
import { Textarea } from "@/components/ui/Textarea"
import { Camera, ImagePlus, X, Upload, Sparkles, Loader2, UserCheck, HandHeart, Truck } from "lucide-react"
import { api, resolveImageUrl } from "@/lib/api"
import { getDonorToken } from "@/lib/donorSession"
import { lookupLocalities } from "@/lib/mumbaiPincodes"

interface PhotoItem {
  file: File
  previewUrl: string
  status: "pending" | "analyzing" | "done" | "error"
  storagePath?: string
}

interface ItemSuggestion {
  category: string
  title: string
  description: string
  condition: string
  brand: string | null
  gender: string
}

const LAUNCH_CATEGORIES = ["Clothing", "Footwear", "Bags"]

const DATE_RANGE_PRESETS = ["Next 3 days", "Next 7 days", "Next 2 weeks", "Flexible"]
const TIME_WINDOW_PRESETS = ["Mornings", "Afternoons", "Evenings", "Weekends only"]

export function Give() {
  const [step, setStep] = useState(1)
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [photoItems, setPhotoItems] = useState<PhotoItem[]>([])
  const [analyzing, setAnalyzing] = useState(false)
  const [aiApplied, setAiApplied] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    itemTitle: "",
    category: "Clothing",
    gender: "unisex",
    description: "",
    condition: "Good",
    size: "",
    quantity: 1,
    brand: "",
    age: "",
    defect: "",
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    contactMethod: "WhatsApp",
    recognitionPreference: "anonymous",
    aliasName: "",
    city: "Mumbai",
    pincode: "",
    pickupLocality: "",
    dateRange: "",
    timeWindow: "",
    notes: "",
    declaration: false,
    handoverMethod: "self" as "self" | "delivery_partner",
  })

  // If a donor is already logged in and onboarded, we already have their
  // name/phone/address/pincode on file — reuse it end-to-end instead of
  // asking again. hasSavedAddress gates showing a reuse summary (with an
  // Edit escape hatch) instead of the raw city/pincode/locality inputs.
  const [skipDonorDetails, setSkipDonorDetails] = useState(false)
  const [hasSavedAddress, setHasSavedAddress] = useState(false)
  const [editingAddress, setEditingAddress] = useState(false)

  useEffect(() => {
    if (!getDonorToken()) return
    api.donor
      .get<{ profile: { name: string | null; phone: string | null; address: string | null; pincode: string | null; onboardedAt: string | null } | null }>("/api/donor/profile")
      .then(({ profile }) => {
        if (!profile?.onboardedAt) return
        const [firstName, ...rest] = (profile.name || "").split(" ")
        setFormData(prev => ({
          ...prev,
          firstName: prev.firstName || firstName || "",
          lastName: prev.lastName || rest.join(" ") || "",
          phone: prev.phone || profile.phone || "",
          pickupLocality: prev.pickupLocality || profile.address || "",
          pincode: prev.pincode || profile.pincode || "",
        }))
        setSkipDonorDetails(true)
        if (profile.address) setHasSavedAddress(true)
      })
      .catch(() => {})
  }, [])

  const steps = skipDonorDetails ? [1, 2, 4, 5] : [1, 2, 3, 4, 5]

  const handleBack = () => {
    setStep(s => {
      const idx = steps.indexOf(s)
      return idx > 0 ? steps[idx - 1] : s
    })
  }

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files: File[] = Array.from(e.target.files)
      setPhotoItems(prev => [
        ...prev,
        ...files.map(file => ({ file, previewUrl: URL.createObjectURL(file), status: "pending" as const })),
      ])
    }
  }

  const removePhoto = (index: number) => {
    setPhotoItems(prev => prev.filter((_, i) => i !== index))
  }

  // Runs every photo through the same background-removal + Gemini
  // categorization pipeline as admin bulk-upload — swaps previews to the
  // white-bg processed version and pre-fills item details from the AI's
  // best guess. A photo that fails analysis just stays as the raw upload;
  // it never blocks the donor from continuing.
  const analyzePhotos = async () => {
    if (analyzing || aiApplied || photoItems.length === 0) return
    setAnalyzing(true)
    try {
      const form = new FormData()
      photoItems.forEach(p => form.append("photos", p.file))

      const { results } = await api.postForm<{
        results: (
          | { ok: true; originalName: string; storagePath: string; url: string; suggestion: ItemSuggestion }
          | { ok: false; originalName: string; error: string }
        )[]
      }>("/api/donations/analyze-photos", form)

      setPhotoItems(prev =>
        prev.map((p, i) => {
          const r = results[i]
          if (!r || !r.ok) return { ...p, status: "error" }
          return { ...p, status: "done", storagePath: r.storagePath, previewUrl: resolveImageUrl(r.storagePath) }
        })
      )

      const firstSuggestion = results.find((r): r is Extract<typeof r, { ok: true }> => r.ok)?.suggestion
      if (firstSuggestion) {
        setFormData(prev => ({
          ...prev,
          itemTitle: prev.itemTitle || firstSuggestion.title,
          category: firstSuggestion.category,
          gender: firstSuggestion.gender || prev.gender,
          description: prev.description || firstSuggestion.description,
          condition: firstSuggestion.condition,
          brand: prev.brand || firstSuggestion.brand || "",
        }))
        setAiApplied(true)
      }
    } catch (err) {
      console.error("Photo analysis failed:", err)
      setPhotoItems(prev => prev.map(p => (p.status === "pending" ? { ...p, status: "error" } : p)))
    } finally {
      setAnalyzing(false)
    }
  }

  // Blocks "Continue" until the current step's required fields are actually
  // filled — the wizard has no native form submit per step, so nothing else
  // was stopping a donor from skipping straight through with blanks.
  function isStepValid(s: number): boolean {
    if (s === 1) return photoItems.length > 0
    if (s === 2) return formData.itemTitle.trim().length >= 2 && formData.description.trim().length >= 5 && formData.quantity >= 1
    if (s === 3) {
      return (
        formData.firstName.trim().length >= 1 &&
        /^[6-9]\d{9}$/.test(formData.phone) &&
        (formData.recognitionPreference !== "alias" || formData.aliasName.trim().length > 0)
      )
    }
    if (s === 4) {
      return (
        formData.pickupLocality.trim().length >= 2 &&
        formData.dateRange.trim().length > 0 &&
        formData.timeWindow.trim().length > 0
      )
    }
    return true
  }

  const handleNext = async () => {
    if (step === 1) {
      await analyzePhotos()
    }
    setStep(s => {
      const idx = steps.indexOf(s)
      return idx < steps.length - 1 ? steps[idx + 1] : s
    })
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    setSubmitError(null)

    try {
      const form = new FormData()
      form.append("itemTitle", formData.itemTitle)
      form.append("category", formData.category)
      form.append("gender", formData.gender)
      form.append("description", formData.description)
      form.append("condition", formData.condition)
      form.append("size", formData.size)
      form.append("quantity", String(formData.quantity))
      form.append("brand", formData.brand)
      form.append("age", formData.age)
      form.append("defect", formData.defect)
      form.append("firstName", formData.firstName)
      form.append("lastName", formData.lastName)
      form.append("phone", formData.phone)
      form.append("email", formData.email)
      form.append("contactMethod", formData.contactMethod)
      form.append("recognitionPreference", formData.recognitionPreference)
      form.append("aliasName", formData.aliasName)
      form.append("pickupLocality", formData.pickupLocality)
      form.append("dateRange", formData.dateRange)
      form.append("timeWindow", formData.timeWindow)
      form.append("notes", formData.notes)
      form.append("declaration", String(formData.declaration))
      form.append("handoverMethod", formData.handoverMethod)

      const processedPaths = photoItems.filter(p => p.status === "done" && p.storagePath).map(p => p.storagePath as string)
      if (processedPaths.length > 0) form.append("photoStoragePaths", JSON.stringify(processedPaths))
      photoItems.filter(p => p.status !== "done").forEach(p => form.append("photos", p.file))

      const result = await api.postForm<{ reference: string }>("/api/donations", form)
      setIsSubmitting(false)
      navigate(`/give/success/${result.reference}`)
    } catch (error: any) {
      console.error("Error saving donation:", error)
      setSubmitError(error?.message || "Failed to submit. Please try again.")
      setIsSubmitting(false)
    }
  }

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-8 md:py-16">
      <div className="mb-8">
        <h1 className="text-4xl font-display font-black uppercase tracking-tight">Drop an item</h1>
        <div className="mt-6 flex items-center gap-1.5">
           {steps.map(s => (
             <div key={s} className={`h-1.5 flex-1 rounded-none ${steps.indexOf(s) <= steps.indexOf(step) ? 'bg-foreground' : 'bg-black/10'}`} />
           ))}
        </div>
      </div>

      <div className="bg-white border-2 border-foreground p-6 md:p-8 shadow-[8px_8px_0px_rgba(0,0,0,1)] min-h-[500px] flex flex-col">
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex flex-col gap-6 flex-1"
            >
              <div>
                <h2 className="text-3xl font-display font-bold uppercase mb-2">Drop something. Someone else needs it.</h2>
                <p className="text-foreground-muted">Take a clear photo or choose one from your gallery. We will ask for the details next.</p>
              </div>

              {photoItems.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-6 border-2 border-dashed border-foreground/30 p-8 bg-surface-muted">
                  <div className="flex gap-4">
                    <Button onClick={() => fileInputRef.current?.click()} size="lg" className="h-16 gap-3 rounded-none border-2 border-foreground shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all font-bold">
                      <Camera className="w-6 h-6" />
                      Take a photo
                    </Button>
                  </div>
                  <p className="text-sm font-bold text-foreground-muted uppercase tracking-widest">or</p>
                  <Button onClick={() => fileInputRef.current?.click()} className="border-2 border-foreground rounded-none shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all font-bold bg-accent-green text-foreground hover:bg-accent-green">
                    <ImagePlus className="w-4 h-4 mr-2" /> Upload from gallery
                  </Button>
                </div>
              ) : (
                <div className="flex-1 flex flex-col gap-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {photoItems.map((p, index) => (
                      <div key={index} className="relative aspect-square border-2 border-foreground bg-surface-muted">
                        <img src={p.previewUrl} alt={`Upload ${index + 1}`} className="w-full h-full object-cover" />
                        {p.status === "done" && (
                          <span className="absolute bottom-2 left-2 flex items-center gap-1 bg-accent-green border-2 border-foreground px-1.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-foreground shadow-[1px_1px_0px_rgba(0,0,0,1)]">
                            <Sparkles className="w-3 h-3" /> AI enhanced
                          </span>
                        )}
                        {analyzing && p.status === "pending" && (
                          <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                            <Loader2 className="w-6 h-6 animate-spin text-foreground" />
                          </div>
                        )}
                        <button onClick={() => removePhoto(index)} className="absolute top-2 right-2 p-1 bg-white border-2 border-foreground shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all z-10">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    {photoItems.length < 5 && (
                      <button onClick={() => fileInputRef.current?.click()} className="aspect-square border-2 border-dashed border-foreground/30 bg-surface-muted flex flex-col items-center justify-center gap-2 hover:bg-black/5 transition-colors">
                        <Upload className="w-6 h-6 text-foreground-muted" />
                        <span className="text-xs font-bold uppercase tracking-wider text-foreground-muted">Add Another</span>
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-foreground-muted mt-2 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" /> Our AI removes the background and pre-fills item details from your photo — you'll confirm everything on the next step.
                  </p>
                </div>
              )}
              
              {/* Hidden file input supporting mobile camera */}
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*" 
                capture="environment" 
                multiple 
                onChange={handlePhotoUpload} 
              />
            </motion.div>
          )}

          {step === 2 && (
             <motion.div
               key="step2"
               initial={{ opacity: 0, x: 20 }}
               animate={{ opacity: 1, x: 0 }}
               exit={{ opacity: 0, x: -20 }}
               className="flex flex-col gap-6 flex-1"
             >
               <div>
                 <h2 className="text-3xl font-display font-bold uppercase mb-2">Item Details</h2>
                 <p className="text-foreground-muted">Tell us about what you are passing on.</p>
               </div>

               {aiApplied && (
                 <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest bg-accent-green/15 text-foreground border-2 border-foreground px-3 py-2">
                   <Sparkles className="w-4 h-4" /> Pre-filled from your photo by AI — please review and edit.
                 </div>
               )}

               <div className="flex flex-col gap-4">
                 <div className="flex flex-col gap-1.5">
                   <label className="text-sm font-bold uppercase tracking-widest text-foreground">Item Title *</label>
                   <Input value={formData.itemTitle} onChange={e => setFormData({...formData, itemTitle: e.target.value})} placeholder="e.g. Vintage Denim Jacket" className="rounded-none border-2 border-foreground" />
                 </div>
                 
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <div className="flex flex-col gap-1.5">
                     <label className="text-sm font-bold uppercase tracking-widest text-foreground">Category *</label>
                     <select 
                        value={formData.category} 
                        onChange={e => setFormData({...formData, category: e.target.value})}
                        className="flex h-10 w-full bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 rounded-none border-2 border-foreground"
                      >
                       {LAUNCH_CATEGORIES.map(c => (
                         <option key={c} value={c}>{c}</option>
                       ))}
                     </select>
                   </div>

                   <div className="flex flex-col gap-1.5">
                     <label className="text-sm font-bold uppercase tracking-widest text-foreground">Who's it for? *</label>
                     <select
                        value={formData.gender}
                        onChange={e => setFormData({...formData, gender: e.target.value})}
                        className="flex h-10 w-full bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 rounded-none border-2 border-foreground"
                      >
                       <option value="men">Men</option>
                       <option value="women">Women</option>
                       <option value="kids">Kids</option>
                       <option value="unisex">Unisex</option>
                     </select>
                   </div>
                 </div>

                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <div className="flex flex-col gap-1.5">
                     <label className="text-sm font-bold uppercase tracking-widest text-foreground">Condition *</label>
                     <select 
                        value={formData.condition} 
                        onChange={e => setFormData({...formData, condition: e.target.value})}
                        className="flex h-10 w-full bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 rounded-none border-2 border-foreground"
                      >
                       <option value="Excellent">Excellent</option>
                       <option value="Good">Good</option>
                       <option value="Fair but fully usable">Fair but fully usable</option>
                     </select>
                   </div>
                 </div>
                 
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <div className="flex flex-col gap-1.5">
                     <label className="text-sm font-bold uppercase tracking-widest text-foreground">Size / Dimensions</label>
                     <Input value={formData.size} onChange={e => setFormData({...formData, size: e.target.value})} placeholder="Optional" className="rounded-none border-2 border-foreground" />
                   </div>
                   <div className="flex flex-col gap-1.5">
                     <label className="text-sm font-bold uppercase tracking-widest text-foreground">Quantity *</label>
                     <Input type="number" min="1" value={formData.quantity} onChange={e => setFormData({...formData, quantity: parseInt(e.target.value) || 1})} className="rounded-none border-2 border-foreground" />
                   </div>
                 </div>
                 
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <div className="flex flex-col gap-1.5">
                     <label className="text-sm font-bold uppercase tracking-widest text-foreground">Brand</label>
                     <Input value={formData.brand} onChange={e => setFormData({...formData, brand: e.target.value})} placeholder="Optional" className="rounded-none border-2 border-foreground" />
                   </div>
                   <div className="flex flex-col gap-1.5">
                     <label className="text-sm font-bold uppercase tracking-widest text-foreground">Approx. Age</label>
                     <Input value={formData.age} onChange={e => setFormData({...formData, age: e.target.value})} placeholder="Optional" className="rounded-none border-2 border-foreground" />
                   </div>
                 </div>

                 <div className="flex flex-col gap-1.5">
                   <label className="text-sm font-bold uppercase tracking-widest text-foreground">Description *</label>
                   <Textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="Why are you giving it away? What should someone know?" className="rounded-none border-2 border-foreground h-24" />
                 </div>
                 
                 <div className="flex flex-col gap-1.5">
                   <label className="text-sm font-bold uppercase tracking-widest text-foreground">Any defects? (Optional)</label>
                   <Input value={formData.defect} onChange={e => setFormData({...formData, defect: e.target.value})} placeholder="e.g. Missing a button, minor scratch — leave blank if none" className="rounded-none border-2 border-foreground" />
                 </div>
               </div>
             </motion.div>
          )}

          {step === 3 && (
             <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col gap-6 flex-1">
               <div>
                 <h2 className="text-3xl font-display font-bold uppercase mb-2">Donor Details</h2>
                 <p className="text-foreground-muted">How we can contact you regarding this donation.</p>
               </div>
               
               <div className="flex flex-col gap-4">
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <div className="flex flex-col gap-1.5">
                     <label className="text-sm font-bold uppercase tracking-widest text-foreground">First Name *</label>
                     <Input value={formData.firstName} onChange={e => setFormData({...formData, firstName: e.target.value})} maxLength={80} className="rounded-none border-2 border-foreground" />
                   </div>
                   <div className="flex flex-col gap-1.5">
                     <label className="text-sm font-bold uppercase tracking-widest text-foreground">Last Name (Optional)</label>
                     <Input value={formData.lastName} onChange={e => setFormData({...formData, lastName: e.target.value})} maxLength={80} className="rounded-none border-2 border-foreground" />
                   </div>
                 </div>
                 
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <div className="flex flex-col gap-1.5">
                     <label className="text-sm font-bold uppercase tracking-widest text-foreground">Mobile Number *</label>
                     <Input type="tel" inputMode="numeric" maxLength={10} value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value.replace(/\D/g, "").slice(0, 10)})} className="rounded-none border-2 border-foreground" />
                   </div>
                   <div className="flex flex-col gap-1.5">
                     <label className="text-sm font-bold uppercase tracking-widest text-foreground">Email (Optional)</label>
                     <Input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="rounded-none border-2 border-foreground" />
                   </div>
                 </div>
                 
                 <div className="flex flex-col gap-1.5">
                   <label className="text-sm font-bold uppercase tracking-widest text-foreground">Preferred Contact Method *</label>
                   <select 
                      value={formData.contactMethod} 
                      onChange={e => setFormData({...formData, contactMethod: e.target.value})}
                      className="flex h-10 w-full bg-background px-3 py-2 text-sm ring-offset-background border-2 border-foreground rounded-none"
                    >
                     <option value="WhatsApp">WhatsApp</option>
                     <option value="Phone Call">Phone Call</option>
                     <option value="Email">Email</option>
                   </select>
                 </div>
                 
                 <div className="flex flex-col gap-3 mt-4 border-t-2 border-foreground/10 pt-4">
                   <label className="text-sm font-bold uppercase tracking-widest text-foreground mb-2">Wall of Love Recognition</label>
                   
                   <label className="flex items-center gap-3 p-3 border-2 border-foreground bg-surface-muted cursor-pointer hover:bg-black/5">
                     <input 
                        type="radio" 
                        name="recognition" 
                        value="name" 
                        checked={formData.recognitionPreference === 'name'} 
                        onChange={() => setFormData({...formData, recognitionPreference: 'name'})}
                        className="w-4 h-4 text-foreground focus:ring-foreground"
                      />
                     <span className="font-bold">Show my first name</span>
                   </label>

                   <label className="flex items-center gap-3 p-3 border-2 border-foreground bg-surface-muted cursor-pointer hover:bg-black/5">
                     <input
                        type="radio"
                        name="recognition"
                        value="alias"
                        checked={formData.recognitionPreference === 'alias'}
                        onChange={() => setFormData({...formData, recognitionPreference: 'alias'})}
                        className="w-4 h-4 text-foreground focus:ring-foreground"
                      />
                     <span className="font-bold">Show a nickname instead</span>
                   </label>
                   {formData.recognitionPreference === 'alias' && (
                     <Input
                       value={formData.aliasName}
                       onChange={e => setFormData({...formData, aliasName: e.target.value})}
                       placeholder="e.g. A kind Mumbaikar"
                       className="rounded-none border-2 border-foreground ml-1"
                     />
                   )}

                   <label className="flex items-center gap-3 p-3 border-2 border-foreground bg-surface-muted cursor-pointer hover:bg-black/5">
                     <input
                        type="radio"
                        name="recognition"
                        value="anonymous"
                        checked={formData.recognitionPreference === 'anonymous'}
                        onChange={() => setFormData({...formData, recognitionPreference: 'anonymous'})}
                        className="w-4 h-4 text-foreground focus:ring-foreground"
                      />
                     <span className="font-bold">Keep me anonymous</span>
                   </label>
                 </div>
               </div>
             </motion.div>
          )}

          {step === 4 && (
             <motion.div key="step4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col gap-6 flex-1">
               <div>
                 <h2 className="text-3xl font-display font-bold uppercase mb-2">Availability</h2>
                 <p className="text-foreground-muted">Where and when can this be picked up?</p>
               </div>

               {hasSavedAddress && !editingAddress && (
                 <div className="flex items-center justify-between gap-2 text-xs font-bold uppercase tracking-widest bg-accent-green/15 text-foreground border-2 border-foreground px-3 py-2">
                   <span className="flex items-center gap-2"><UserCheck className="w-4 h-4" /> Using the address from your account.</span>
                   <button type="button" onClick={() => setEditingAddress(true)} className="underline shrink-0">Edit</button>
                 </div>
               )}

               <div className="flex flex-col gap-1.5">
                 <label className="text-sm font-bold uppercase tracking-widest text-foreground">How should this reach us? *</label>
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <button
                     type="button"
                     onClick={() => setFormData({ ...formData, handoverMethod: "self" })}
                     className={`flex flex-col items-start gap-2 p-4 border-2 border-foreground text-left transition-all ${
                       formData.handoverMethod === "self"
                         ? "bg-accent-green shadow-[4px_4px_0px_rgba(0,0,0,1)]"
                         : "bg-white hover:bg-black/5"
                     }`}
                   >
                     <HandHeart className="w-6 h-6" />
                     <span className="font-black uppercase tracking-widest text-sm">Drop it with us directly</span>
                     <span className="text-xs text-foreground/70 font-medium">We arrange a pickup, or you drop it off — coordinated using the details below.</span>
                   </button>

                   <div className="relative flex flex-col items-start gap-2 p-4 border-2 border-dashed border-foreground/30 bg-surface-muted text-left opacity-60 cursor-not-allowed">
                     <span className="absolute top-3 right-3 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 bg-foreground text-background">Coming soon</span>
                     <Truck className="w-6 h-6" />
                     <span className="font-black uppercase tracking-widest text-sm">Delivery partner pickup</span>
                     <span className="text-xs text-foreground-muted font-medium">A courier partner picks it up from your door. Not live yet.</span>
                   </div>
                 </div>
               </div>

               <div className="flex flex-col gap-4">
                 {hasSavedAddress && !editingAddress ? (
                   <div className="flex flex-col gap-1.5">
                     <label className="text-sm font-bold uppercase tracking-widest text-foreground">Pickup Address</label>
                     <div className="border-2 border-foreground bg-surface-muted px-4 py-3">
                       <p className="font-bold">{formData.pickupLocality}</p>
                       {formData.pincode && <p className="text-xs text-foreground-muted mt-1">Pincode: {formData.pincode}</p>}
                     </div>
                   </div>
                 ) : (
                   <>
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                       <div className="flex flex-col gap-1.5">
                         <label className="text-sm font-bold uppercase tracking-widest text-foreground">City *</label>
                         <select
                            value={formData.city}
                            disabled
                            className="flex h-10 w-full bg-surface-muted px-3 py-2 text-sm rounded-none border-2 border-foreground text-foreground-muted cursor-not-allowed"
                          >
                           <option value="Mumbai">Mumbai</option>
                         </select>
                       </div>
                       <div className="flex flex-col gap-1.5">
                         <label className="text-sm font-bold uppercase tracking-widest text-foreground">Pincode</label>
                         <Input
                           value={formData.pincode}
                           maxLength={6}
                           inputMode="numeric"
                           onChange={e => {
                             const pincode = e.target.value.replace(/\D/g, "").slice(0, 6)
                             const matches = lookupLocalities(pincode)
                             setFormData(prev => ({
                               ...prev,
                               pincode,
                               pickupLocality: matches.length === 1 ? `${matches[0]}, Mumbai` : prev.pickupLocality,
                             }))
                           }}
                           placeholder="e.g. 400050"
                           className="rounded-none border-2 border-foreground"
                         />
                       </div>
                     </div>

                     <div className="flex flex-col gap-1.5">
                       <label className="text-sm font-bold uppercase tracking-widest text-foreground">Broad Pickup Locality *</label>
                       {(() => {
                         const matches = lookupLocalities(formData.pincode)
                         if (matches.length > 1) {
                           return (
                             <select
                                value={formData.pickupLocality}
                                onChange={e => setFormData({...formData, pickupLocality: e.target.value})}
                                className="flex h-10 w-full bg-background px-3 py-2 text-sm rounded-none border-2 border-foreground"
                              >
                               <option value="">Select your locality</option>
                               {matches.map(m => (
                                 <option key={m} value={`${m}, Mumbai`}>{m}</option>
                               ))}
                             </select>
                           )
                         }
                         return (
                           <AddressAutocomplete value={formData.pickupLocality} onChange={val => setFormData({...formData, pickupLocality: val})} placeholder="e.g. Bandra West, Mumbai" className="rounded-none border-2 border-foreground" />
                         )
                       })()}
                       <p className="text-xs text-foreground-muted">We do not publicly expose your exact address. {formData.pincode && lookupLocalities(formData.pincode).length === 0 ? "Pincode not recognised — type your locality manually." : ""}</p>
                     </div>
                   </>
                 )}

                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <div className="flex flex-col gap-1.5">
                     <label className="text-sm font-bold uppercase tracking-widest text-foreground">Preferred Date Range *</label>
                     <div className="grid grid-cols-2 gap-2">
                       {DATE_RANGE_PRESETS.map(preset => (
                         <button
                           key={preset}
                           type="button"
                           onClick={() => setFormData({...formData, dateRange: preset})}
                           className={`h-10 px-2 border-2 border-foreground text-xs font-black uppercase tracking-widest transition-colors ${
                             formData.dateRange === preset ? "bg-accent-pink" : "bg-white hover:bg-black/5"
                           }`}
                         >
                           {preset}
                         </button>
                       ))}
                     </div>
                     <Input value={formData.dateRange} onChange={e => setFormData({...formData, dateRange: e.target.value})} placeholder="Or type your own" className="rounded-none border-2 border-foreground" />
                   </div>
                   <div className="flex flex-col gap-1.5">
                     <label className="text-sm font-bold uppercase tracking-widest text-foreground">Preferred Time Window *</label>
                     <div className="grid grid-cols-2 gap-2">
                       {TIME_WINDOW_PRESETS.map(preset => (
                         <button
                           key={preset}
                           type="button"
                           onClick={() => setFormData({...formData, timeWindow: preset})}
                           className={`h-10 px-2 border-2 border-foreground text-xs font-black uppercase tracking-widest transition-colors ${
                             formData.timeWindow === preset ? "bg-accent-pink" : "bg-white hover:bg-black/5"
                           }`}
                         >
                           {preset}
                         </button>
                       ))}
                     </div>
                     <Input value={formData.timeWindow} onChange={e => setFormData({...formData, timeWindow: e.target.value})} placeholder="Or type your own" className="rounded-none border-2 border-foreground" />
                   </div>
                 </div>

                 <div className="flex flex-col gap-1.5">
                   <label className="text-sm font-bold uppercase tracking-widest text-foreground">Coordination Notes</label>
                   <Textarea value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} placeholder="Any specific instructions for the handover partner?" className="rounded-none border-2 border-foreground h-24" />
                 </div>
               </div>
             </motion.div>
          )}

          {step === 5 && (
             <motion.div key="step5" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col gap-6 flex-1">
               <div>
                 <h2 className="text-3xl font-display font-bold uppercase mb-2">Review & Submit</h2>
                 <p className="text-foreground-muted">Please confirm your details before submitting.</p>
               </div>
               
               <div className="flex-1 overflow-y-auto pr-2 flex flex-col gap-6">
                 
                 <div className="grid grid-cols-3 gap-2">
                   {photoItems.map((p, i) => (
                     <img key={i} src={p.previewUrl} alt="Upload preview" className="w-full aspect-square object-cover border-2 border-foreground bg-surface-muted" />
                   ))}
                 </div>
                 
                 <div className="bg-surface-muted border-2 border-foreground p-4">
                   <div className="flex justify-between items-center mb-4 border-b-2 border-foreground/10 pb-2">
                     <h3 className="font-bold uppercase tracking-widest">Item Details</h3>
                     <button onClick={() => setStep(2)} className="text-xs font-bold underline">Edit</button>
                   </div>
                   <div className="grid grid-cols-2 gap-y-4 text-sm">
                     <div>
                       <span className="text-foreground-muted font-bold block text-xs uppercase tracking-widest">Title</span>
                       {formData.itemTitle || "-"}
                     </div>
                     <div>
                       <span className="text-foreground-muted font-bold block text-xs uppercase tracking-widest">Category</span>
                       {formData.category}
                     </div>
                     <div>
                       <span className="text-foreground-muted font-bold block text-xs uppercase tracking-widest">For</span>
                       {formData.gender === "men" ? "Men" : formData.gender === "women" ? "Women" : formData.gender === "kids" ? "Kids" : "Unisex"}
                     </div>
                     <div>
                       <span className="text-foreground-muted font-bold block text-xs uppercase tracking-widest">Condition</span>
                       {formData.condition}
                     </div>
                     <div>
                       <span className="text-foreground-muted font-bold block text-xs uppercase tracking-widest">Quantity</span>
                       {formData.quantity}
                     </div>
                   </div>
                 </div>
                 
                 <div className="bg-surface-muted border-2 border-foreground p-4">
                   <div className="flex justify-between items-center mb-4 border-b-2 border-foreground/10 pb-2">
                     <h3 className="font-bold uppercase tracking-widest">Availability</h3>
                     <button onClick={() => setStep(4)} className="text-xs font-bold underline">Edit</button>
                   </div>
                   <div className="grid grid-cols-2 gap-y-4 text-sm">
                     <div>
                       <span className="text-foreground-muted font-bold block text-xs uppercase tracking-widest">Locality</span>
                       {formData.pickupLocality || "-"}
                     </div>
                     <div>
                       <span className="text-foreground-muted font-bold block text-xs uppercase tracking-widest">Time</span>
                       {formData.timeWindow || "-"}
                     </div>
                   </div>
                 </div>
                 
                 <label className="flex items-start gap-4 p-4 border-2 border-foreground bg-white cursor-pointer hover:bg-black/5 mt-4">
                   <input 
                     type="checkbox" 
                     checked={formData.declaration}
                     onChange={(e) => setFormData({...formData, declaration: e.target.checked})}
                     className="mt-1 w-5 h-5 rounded-none border-2 border-foreground text-foreground focus:ring-foreground" 
                   />
                   <span className="text-sm font-medium">I confirm the item is clean, safe, fully usable, and not materially torn or stained. I am giving it freely without receiving payment.</span>
                 </label>
                 
               </div>
             </motion.div>
          )}
        </AnimatePresence>

        {submitError && (
          <div className="mt-6 bg-red-50 border-2 border-accent-red p-4 font-bold text-accent-red text-sm">
            {submitError}
          </div>
        )}

        <div className="mt-8 flex justify-between pt-6 border-t-2 border-foreground">
          <Button variant="ghost" onClick={handleBack} disabled={step === 1} className="font-bold uppercase tracking-widest hover:bg-black/5 rounded-none">
            Back
          </Button>
          
          {step < 5 ? (
            <Button onClick={handleNext} disabled={!isStepValid(step) || analyzing} className="font-bold uppercase tracking-widest border-2 border-foreground rounded-none shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all bg-accent-pink text-foreground hover:bg-accent-pink">
              {step === 1 && analyzing ? (
                <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Analyzing photos...</span>
              ) : (
                "Continue"
              )}
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={!formData.declaration || isSubmitting} className="font-bold uppercase tracking-widest border-2 border-foreground rounded-none shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all bg-accent-pink text-foreground hover:bg-accent-pink">
              {isSubmitting ? 'Submitting...' : 'Submit Donation'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

