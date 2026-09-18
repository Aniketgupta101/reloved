import React, { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { AnalyticsEvent, track } from "@/lib/analytics"

export function Track() {
  const [reference, setReference] = useState("")
  const navigate = useNavigate()

  const handleTrack = (e: React.FormEvent) => {
    e.preventDefault()
    if (reference.trim()) {
      const ref = reference.trim().toUpperCase()
      track(AnalyticsEvent.trackLookup, { reference: ref })
      navigate(`/track/${ref}`)
    }
  }

  return (
    <div className="w-full max-w-xl mx-auto px-4 py-16 sm:py-24 flex flex-col gap-10 sm:gap-12">
      <div className="flex flex-col gap-4 text-center items-center">
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-display font-bold text-balance">Track Submission</h1>
        <p className="text-foreground-muted">Enter your submission reference to check its current status.</p>
      </div>

      <form onSubmit={handleTrack} className="bg-white p-6 sm:p-8 border-2 border-foreground shadow-[8px_8px_0px_rgba(0,0,0,1)] rounded-none flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold">Reference Number</label>
          <Input 
            value={reference} 
            onChange={e => setReference(e.target.value)} 
            placeholder="e.g. A1B2C3D4"
            className="uppercase"
            required
          />
        </div>
        <Button type="submit">Track</Button>
      </form>
    </div>
  )
}
