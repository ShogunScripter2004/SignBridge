"use client"
import { Volume2 } from "lucide-react"
import { ClearCard } from "./clear-card"

type Props = {
  language: "en" | "hi" | "mr"
  setLanguage: (lang: "en" | "hi" | "mr") => void
  sentence: string
  onClear: () => void
}

export function ControlsCard({ language, setLanguage, sentence, onClear }: Props) {
  async function handleSpeak() {
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: sentence }),
      })
      const data = await res.json()
      // You can wire up audio playback later using the returned placeholder data
      console.log("[v0] TTS placeholder response:", data)
    } catch (e) {
      console.log("[v0] TTS request failed:", (e as Error).message)
    }
  }

  return (
    <ClearCard>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <label htmlFor="language" className="sr-only">
            Select language
          </label>
          <select
            id="language"
            value={language}
            onChange={(e) => setLanguage(e.target.value as "en" | "hi" | "mr")}
            className={[
              "w-full rounded-md border border-white/40 bg-white/70 backdrop-blur px-3 py-2",
              "text-neutral-800 outline-none",
              "focus:ring-2 focus:ring-[#10B981]/40",
            ].join(" ")}
            aria-label="Select language"
          >
            <option value="en">English</option>
            <option value="hi">Hindi</option>
            <option value="mr">Marathi</option>
          </select>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSpeak}
            aria-label="Speak sentence"
            className={[
              "inline-flex items-center gap-2 rounded-md px-3 py-2 text-white",
              "transition-transform duration-150",
              "active:scale-95 hover:scale-105",
            ].join(" ")}
            style={{ backgroundColor: "#10B981" }}
          >
            <Volume2 className="h-4 w-4" aria-hidden="true" />
            <span className="text-sm">Speak</span>
          </button>

          <button
            type="button"
            onClick={onClear}
            className={[
              "inline-flex items-center gap-2 rounded-md px-3 py-2",
              "border border-[#10B981]/30 text-[#10B981] bg-white/70",
              "transition-transform duration-150",
              "active:scale-95 hover:scale-105",
            ].join(" ")}
            aria-label="Clear text"
          >
            Clear
          </button>
        </div>

        <p className="text-xs text-neutral-500">Tip: Language affects Translate/TTS.</p>
      </div>
    </ClearCard>
  )
}
