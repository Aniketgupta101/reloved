import { useGiveFlow } from "./giveFlow"
export function GiveProgress() {
  const { steps, step, STEP_LABELS } = useGiveFlow()
  return (
    <div className="mb-5 sm:mb-8">
      <h1 className="text-3xl sm:text-4xl font-display font-black uppercase tracking-tight">Drop an item</h1>
      <div className="mt-4 sm:mt-6 flex items-center gap-1 sm:gap-1.5">
         {steps.map(s => (
           <div key={s} className="flex-1 flex flex-col gap-1 min-w-0">
             <div className={`h-1 sm:h-1.5 rounded-none ${steps.indexOf(s) <= steps.indexOf(step) ? "bg-foreground" : "bg-black/10"}`} />
             <span
               className={`text-[8px] sm:text-[10px] font-black uppercase tracking-wide truncate ${
                 s === step ? "text-foreground" : "text-foreground-muted"
               }`}
             >
               {STEP_LABELS[s] || s}
             </span>
           </div>
         ))}
      </div>
    </div>
  )
}
