import * as React from "react"
import { cn } from "@/lib/utils"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  icon?: React.ReactNode;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'default', icon, children, ...props }, ref) => {

    const baseStyles = "group inline-flex items-center justify-center whitespace-nowrap rounded-none border-2 border-foreground font-display font-black uppercase tracking-widest shadow-[4px_4px_0px_rgba(0,0,0,1)] transition-all hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"

    const variants = {
      primary: "bg-foreground text-background",
      secondary: "bg-accent-green text-foreground",
      outline: "bg-white text-foreground",
      ghost: "bg-transparent border-transparent shadow-none hover:shadow-none hover:translate-x-0 hover:translate-y-0 hover:bg-black/5 text-foreground",
    }

    const sizes = {
      default: "h-12 px-6 py-3 text-sm",
      sm: "h-10 px-4 py-2 text-xs",
      lg: "h-14 px-8 py-4 text-base",
      icon: "h-12 w-12",
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
            "ml-2 flex h-8 w-8 items-center justify-center border-2 border-foreground transition-transform group-hover:translate-x-0.5",
            variant === 'primary' ? "bg-white/10" : "bg-black/5"
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
