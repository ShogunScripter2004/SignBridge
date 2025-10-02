"use client"
import { Camera } from "lucide-react"

export function CameraPlaceholder() {
  return (
    <div className="aspect-video w-full rounded-lg border border-dashed border-neutral-300 bg-white/50 backdrop-blur-sm flex items-center justify-center">
      <div className="flex items-center gap-2 text-neutral-500">
        <Camera className="h-5 w-5" aria-hidden="true" />
        <span className="text-sm">Camera feed will appear here</span>
      </div>
    </div>
  )
}
