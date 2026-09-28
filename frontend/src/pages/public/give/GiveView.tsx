import { AnimatePresence } from "motion/react"
import { useGiveFlow } from "./giveFlow"
import { GiveProgress } from "./GiveProgress"
import { GiveResumeBanner } from "./GiveResumeBanner"
import { GivePhotoStep } from "./GivePhotoStep"
import { GiveDetailsStep } from "./GiveDetailsStep"
import { GiveDonorStep } from "./GiveDonorStep"
import { GiveHandoverStep } from "./GiveHandoverStep"
import { GiveRecognitionStep } from "./GiveRecognitionStep"
import { GiveReviewStep } from "./GiveReviewStep"
import { GiveLoginStep } from "./GiveLoginStep"
import { GiveTermsStep } from "./GiveTermsStep"
import { GiveActions } from "./GiveActions"
export function GiveView() {
  const { step } = useGiveFlow()
  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-5 sm:py-8 md:py-16 min-w-0">
      <GiveProgress />
      <GiveResumeBanner />
      <div className="bg-white border border-foreground sm:border-2 p-4 sm:p-6 md:p-8 shadow-[2px_2px_0px_rgba(0,0,0,1)] sm:shadow-[8px_8px_0px_rgba(0,0,0,1)] min-h-0 sm:min-h-[500px] flex flex-col min-w-0 overflow-hidden">
        <AnimatePresence mode="wait">
          {step === 1 && <GivePhotoStep key="step1" />}
          {step === 2 && <GiveDetailsStep key="step2" />}
          {step === 3 && <GiveDonorStep key="step3" />}
          {step === 4 && <GiveHandoverStep key="step4" />}
          {step === 5 && <GiveRecognitionStep key="step5" />}
          {step === 6 && <GiveReviewStep key="step6" />}
          {step === 8 && <GiveLoginStep key="step8" />}
          {step === 7 && <GiveTermsStep key="step7" />}
        </AnimatePresence>
        <GiveActions />
      </div>
    </div>
  )
}
