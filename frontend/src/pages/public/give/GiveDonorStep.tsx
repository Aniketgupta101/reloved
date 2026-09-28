import { motion } from "motion/react"
import { Input } from "@/components/ui/Input"
import { useGiveFlow } from "./giveFlow"
export function GiveDonorStep() {
  const {
    formData,
    setFormData,
    profileUsername,
  } = useGiveFlow()
  return (
    <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col gap-6 flex-1">
      <div>
        <h2 className="text-3xl font-display font-bold uppercase mb-2">Donor Details</h2>
        <p className="text-foreground-muted">How we can contact you regarding this drop.</p>
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
            <Input type="tel" name="tel" autoComplete="tel-national" inputMode="numeric" maxLength={10} value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value.replace(/\D/g, "").slice(0, 10)})} className="rounded-none border-2 border-foreground" />
            <p className="text-xs text-foreground-muted">10 digits, starting with 6-9.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold uppercase tracking-widest text-foreground">Email (Optional)</label>
            <Input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="rounded-none border-2 border-foreground" />
          </div>
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

          {profileUsername ? (
            <label className="flex items-center gap-3 p-3 border-2 border-foreground bg-surface-muted cursor-pointer hover:bg-black/5">
              <input
                 type="radio"
                 name="recognition"
                 value="alias"
                 checked={formData.recognitionPreference === 'alias'}
                 onChange={() => setFormData({...formData, recognitionPreference: 'alias', aliasName: profileUsername})}
                 className="w-4 h-4 text-foreground focus:ring-foreground"
               />
              <span className="font-bold">Show my username <span className="text-accent-pink">@{profileUsername}</span></span>
            </label>
          ) : null}

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
  )
}
