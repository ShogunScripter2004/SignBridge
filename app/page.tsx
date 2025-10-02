"use client"

import { useEffect, useMemo, useState } from "react"
import { ClearCard } from "@/components/clear-card"
import { CameraPlaceholder } from "@/components/camera-placeholder"
import { ControlsCard } from "@/components/controls-card"
import { cn } from "@/lib/utils"

export default function Page() {
  const [showWelcome, setShowWelcome] = useState(true)

  // AI State placeholders
  const [currentWord, setCurrentWord] = useState<string>("")
  const [sentence, setSentence] = useState<string>("")
  const [language, setLanguage] = useState<"en" | "hi" | "mr">("en")

  useEffect(() => {
    const t = setTimeout(() => setShowWelcome(false), 1500)
    return () => clearTimeout(t)
  }, [])

  // For gentle fade/slide of main content after splash
  const contentClass = useMemo(
    () => cn("transition-all duration-500", showWelcome ? "opacity-0 translate-y-4" : "opacity-100 translate-y-0"),
    [showWelcome],
  )

  return (
    <main className="min-h-dvh bg-[#f6f6f6] text-neutral-900">
      {/* Splash screen */}
      {/* We inline here to avoid extra import and ensure the overlay is present */}
      <div
        aria-hidden={!showWelcome}
        className={[
          "fixed inset-0 z-50 flex items-center justify-center",
          "bg-[#f6f6f6] text-neutral-900",
          "transition-opacity duration-500",
          showWelcome ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        ].join(" ")}
      >
        <div
          className={[
            "text-4xl font-semibold tracking-wide select-none",
            "transition-transform duration-500",
            showWelcome ? "scale-100" : "scale-95",
          ].join(" ")}
          style={{ color: "#007AFF" }}
        >
          NAMASTE!
        </div>
      </div>

      {/* Content */}
      <div className={cn("mx-auto w-full max-w-md px-4 py-6", contentClass)}>
        <header className="mb-4">
          <h1 className="text-balance text-center text-2xl font-semibold">Sign Bridge</h1>
          <p className="mt-1 text-center text-sm text-neutral-500">
            Minimal “Clear Card” UI. AI logic will be added later.
          </p>
        </header>

        {/* Camera Card */}
        <ClearCard className="mb-4">
          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-neutral-700">Camera</h2>
            <CameraPlaceholder />
          </div>
        </ClearCard>

        {/* Current Word */}
        <ClearCard className="mb-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-neutral-700">Current Word</h2>
            <span className="text-sm text-neutral-500">Live preview</span>
          </div>
          <div className="mt-2 min-h-10 rounded-md bg-white/70 px-3 py-2 text-neutral-900 backdrop-blur">
            {currentWord || <span className="text-neutral-400">Awaiting prediction…</span>}
          </div>

          {/* Demo controls to emulate incoming prediction (for now) */}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCurrentWord("Hello")}
              className="rounded-md border border-[#007AFF]/30 bg-white/70 px-2 py-1 text-xs text-[#007AFF] transition-transform duration-150 hover:scale-105 active:scale-95"
            >
              Set “Hello”
            </button>
            <button
              type="button"
              onClick={() => setCurrentWord("World")}
              className="rounded-md border border-[#007AFF]/30 bg-white/70 px-2 py-1 text-xs text-[#007AFF] transition-transform duration-150 hover:scale-105 active:scale-95"
            >
              Set “World”
            </button>
            <button
              type="button"
              onClick={() => setCurrentWord("")}
              className="rounded-md border border-[#007AFF]/30 bg-white/70 px-2 py-1 text-xs text-[#007AFF] transition-transform duration-150 hover:scale-105 active:scale-95"
            >
              Clear Word
            </button>
            <button
              type="button"
              onClick={() => setSentence((s) => (currentWord ? (s ? s + " " + currentWord : currentWord) : s))}
              className="rounded-md bg-[#007AFF] px-2 py-1 text-xs text-white transition-transform duration-150 hover:scale-105 active:scale-95"
            >
              Append to Sentence
            </button>
          </div>
        </ClearCard>

        {/* Full Sentence */}
        <ClearCard className="mb-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-neutral-700">Full Sentence</h2>
            <span className="text-sm text-neutral-500">Aggregated</span>
          </div>
          <div className="mt-2 min-h-14 rounded-md bg-white/70 px-3 py-2 text-neutral-900 backdrop-blur">
            {sentence || <span className="text-neutral-400">Your sentence will build here…</span>}
          </div>
        </ClearCard>

        {/* Controls */}
        <ControlsCard
          language={language}
          setLanguage={setLanguage}
          sentence={sentence}
          onClear={() => {
            setCurrentWord("")
            setSentence("")
          }}
        />

        <footer className="mt-6 text-center text-xs text-neutral-400">Built for demo. Accent color: #007AFF</footer>
      </div>
    </main>
  )
}
