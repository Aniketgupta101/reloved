import * as React from "react"
import { cn } from "@/lib/utils"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'cta' | 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  icon?: React.ReactNode;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'cta', size = 'default', icon, children, ...props }, ref) => {

    // Mobile: lighter brutalism (1px border, 2px shadow, wrap text). Desktop keeps full offset.
    const baseStyles =
      "group inline-flex box-border max-w-full w-auto min-w-0 items-center justify-center text-center rounded-none border border-foreground sm:border-2 font-display font-black uppercase tracking-wide shadow-[2px_2px_0px_rgba(0,0,0,1)] sm:shadow-[4px_4px_0px_rgba(0,0,0,1)] transition-all hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] sm:hover:translate-x-[4px] sm:hover:translate-y-[4px] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 whitespace-normal leading-snug break-words hyphens-auto [&>svg]:shrink-0"

    const variants = {
      cta: "bg-foreground text-background hover:bg-foreground",
      primary: "bg-accent-pink text-foreground",
      secondary: "bg-accent-green text-foreground",
      outline: "bg-white text-foreground",
      ghost: "bg-transparent border-transparent shadow-none hover:shadow-none hover:translate-x-0 hover:translate-y-0 hover:bg-black/5 text-foreground",
    }

    const sizes = {
      default: "min-h-11 h-auto px-3 py-2.5 text-[11px] sm:h-12 sm:px-6 sm:py-3 sm:text-sm",
      sm: "min-h-9 h-auto px-2.5 py-2 text-[10px] sm:h-10 sm:px-4 sm:text-xs",
      lg: "min-h-12 h-auto px-4 py-3 text-xs sm:h-14 sm:px-8 sm:py-4 sm:text-base",
      icon: "h-10 w-10 sm:h-12 sm:w-12 shrink-0",
    }

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      >
        {children}
        {icon && (
          <span className={cn(
            "ml-2 flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center border border-foreground sm:border-2 transition-transform group-hover:translate-x-0.5",
            variant === 'cta' ? "bg-white/10" : variant === 'primary' ? "bg-white/10" : "bg-black/5"
          )}>
            {icon}
          </span>
        )}
      </button>
    )
  }
)
Button.displayName = "Button"

export { Button }
