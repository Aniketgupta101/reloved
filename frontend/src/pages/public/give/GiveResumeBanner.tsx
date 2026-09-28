import { useGiveFlow } from "./giveFlow"
export function GiveResumeBanner() {
  const {
    setStep,
    loginResumeNote,
    setLoginResumeNote,
    clearGiveDraft,
    setPhotoItems,
    setItemDrafts,
    setAiApplied,
    skippedAutofillRef,
    analyzeGenRef,
    analyzeInFlightRef,
    setAnalyzing,
    setUploadMode,
  } = useGiveFlow()
  return (
    <>
    {loginResumeNote && (
      <div
        className="mb-4 border-2 border-foreground bg-accent-pink/20 px-3 py-3 text-sm font-bold flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"
        data-testid="login-resume-note"
        role="status"
      >
        <span className="min-w-0">{loginResumeNote}</span>
        <div className="flex gap-3 shrink-0">
          <button
            type="button"
            className="text-xs uppercase tracking-widest underline"
            onClick={() => {
              clearGiveDraft()
              setLoginResumeNote(null)
              setPhotoItems([])
              setItemDrafts({})
              setAiApplied(false)
              skippedAutofillRef.current = false
              analyzeGenRef.current += 1
              analyzeInFlightRef.current = false
              setAnalyzing(false)
              setStep(1)
              setUploadMode("single")
            }}
            data-testid="clear-give-draft"
          >
            Start fresh
          </button>
          <button
            type="button"
            className="text-xs uppercase tracking-widest underline"
            onClick={() => setLoginResumeNote(null)}
          >
            Dismiss
          </button>
        </div>
      </div>
    )}
    </>
  )
}
