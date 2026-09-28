import { Button } from "@/components/ui/Button"
import { Loader2 } from "lucide-react"
import { getDonorToken } from "@/lib/donorSession"
import { LegalReadMore } from "@/components/ui/LegalAccept"
import { InlineFeedback } from "@/components/ui/InlineFeedback"
import { useGiveFlow } from "./giveFlow"
export function GiveActions() {
  const {
    step,
    analyzing,
    compressingPhotos,
    formData,
    submitFeedback,
    handleBack,
    handleSubmit,
    isSubmitting,
    handleNext,
    isStepValid,
    loggedIn,
  } = useGiveFlow()
  return (
    <>
    {submitFeedback && <InlineFeedback feedback={submitFeedback} />}

    <div className="mt-6 sm:mt-8 flow-actions pt-5 sm:pt-6 border-t border-foreground sm:border-t-2">
      <Button variant="ghost" onClick={handleBack} disabled={step === 1} className="font-bold uppercase tracking-wide sm:tracking-widest hover:bg-black/5 rounded-none w-full sm:w-auto shrink-0">
        Back
      </Button>
      
      {step === 7 ? (
        <div className="flex flex-col items-stretch sm:items-end gap-2 w-full sm:max-w-md sm:w-auto min-w-0">
          <Button variant="cta" onClick={handleSubmit} disabled={analyzing || !formData.declaration || !formData.acceptedTerms || isSubmitting || !( /^[6-9]\d{9}$/.test(formData.phone) || formData.email.trim().includes("@") || Boolean(getDonorToken()) )} className="font-bold uppercase tracking-wide sm:tracking-widest w-full">
            {analyzing ? 'Reconnecting photos…' : isSubmitting ? 'Submitting...' : 'I Accept - Submit'}
          </Button>
          <LegalReadMore className="text-left sm:text-right" />
        </div>
      ) : step === 1 && analyzing ? (
        <Button variant="cta" disabled className="font-bold uppercase tracking-wide sm:tracking-widest w-full sm:w-auto shrink-0">
          <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin shrink-0" /> AI reading photos…</span>
        </Button>
      ) : (
        <Button
          variant="cta"
          onClick={handleNext}
          disabled={
            step === 2
              ? compressingPhotos
              : !isStepValid(step) || analyzing || compressingPhotos
          }
          className="font-bold uppercase tracking-wide sm:tracking-widest w-full sm:w-auto shrink-0"
        >
          {step === 1 && compressingPhotos ? (
            <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin shrink-0" /> Preparing photos…</span>
          ) : step === 8 ? (
            "Sign in with email"
          ) : step === 2 && !loggedIn ? (
            "Continue to login"
          ) : (
            "Continue"
          )}
        </Button>
      )}
    </div>
    </>
  )
}
