"use client"

import { cn } from "@/lib/utils"
import type React from "react"
import type { JSX } from "react/jsx-runtime"

type Props = {
  className?: string
  children: React.ReactNode
  as?: keyof JSX.IntrinsicElements
}

export function ClearCard({ className, children, as: Tag = "div" }: Props) {
  return (
    <Tag
      className={cn(
        "rounded-xl border border-white/30 bg-white/60 backdrop-blur-xl",
        "shadow-sm p-4",
        "text-neutral-800",
        className,
      )}
    >
      {children}
    </Tag>
  )
}
