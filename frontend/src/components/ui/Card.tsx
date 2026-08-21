import * as React from "react"
import { cn } from "@/lib/utils"

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("bg-white border-2 border-foreground rounded-none shadow-[4px_4px_0px_rgba(0,0,0,1)]", className)}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardContent({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("p-6", className)} {...props}>
      {children}
    </div>
  )
}
