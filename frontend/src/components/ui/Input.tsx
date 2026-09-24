import * as React from "react"
import { cn } from "@/lib/utils"

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 sm:h-11 w-full max-w-full min-w-0 rounded-none border border-foreground sm:border-2 bg-white px-3 sm:px-4 py-2 text-sm font-medium text-foreground outline-none placeholder:text-foreground-muted focus-visible:shadow-[2px_2px_0px_rgba(0,0,0,1)] disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
