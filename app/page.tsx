"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ClearCard } from "@/components/clear-card"
import { ControlsCard } from "@/components/controls-card"
import { cn } from "@/lib/utils"
import * as tf from "@tensorflow/tfjs"
import type { LayersModel, Tensor } from "@tensorflow/tfjs"

type MPPoint = { x: number; y: number; z: number; visibility?: number }
type MPResults = {
  poseLandmarks?: MPPoint[]
  leftHandLandmarks?: MPPoint[]
  rightHandLandmarks?: MPPoint[]
}

export default function Page() {
  const [showWelcome, setShowWelcome] = useState(true)

  // AI State placeholders
  const [currentWord, setCurrentWord] = useState<string>("")
  const [sentence, setSentence] = useState<string>("")
  const [language, setLanguage] = useState<"en" | "hi" | "mr">("en")

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const modelRef = useRef<LayersModel | null>(null)
  const labelsRef = useRef<string[]>([])
  const seqBufferRef = useRef<number[][]>([])
  const lastVecRef = useRef<number[] | null>(null)
  const pauseTimerRef = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const inputShapeRef = useRef<{ timesteps: number | null; dim: number | null }>({ timesteps: null, dim: null })

  useEffect(() => {
    const t = setTimeout(() => setShowWelcome(false), 1500)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    let cancelled = false

    function l1diff(a: number[], b: number[]) {
      let sum = 0
      const n = Math.min(a.length, b.length)
      for (let i = 0; i < n; i++) sum += Math.abs(a[i] - b[i])
      return sum / (n || 1)
    }

    function buildFeatureVector(results: MPResults): number[] {
      const vec: number[] = []
      const pushLms = (lms?: MPPoint[], includeVis = false) => {
        if (!lms) return
        for (const lm of lms) {
          vec.push(lm.x ?? 0, lm.y ?? 0, lm.z ?? 0)
          if (includeVis) vec.push(lm.visibility ?? 0)
        }
      }
      // 33 pose (x,y,z,visibility), 21 LH (x,y,z), 21 RH (x,y,z)
      pushLms(results.poseLandmarks, true)
      pushLms(results.leftHandLandmarks, false)
      pushLms(results.rightHandLandmarks, false)
      return vec
    }

    function loadScript(src: string): Promise<void> {
      return new Promise((resolve, reject) => {
        // already loaded?
        const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null
        if (existing) {
          // if Holistic is already on window, we're done
          if ((window as any).Holistic) return resolve()
          existing.addEventListener("load", () => resolve())
          existing.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)))
          return
        }
        const s = document.createElement("script")
        s.src = src
        s.async = true
        s.crossOrigin = "anonymous"
        s.addEventListener("load", () => resolve())
        s.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)))
        document.head.appendChild(s)
      })
    }

    async function ensureHolisticViaCDN(): Promise<any> {
      if ((window as any).Holistic) return (window as any).Holistic
      await loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/holistic/holistic.js")
      return (window as any).Holistic
    }

    async function predictFromBuffer() {
      const model = modelRef.current
      if (!model) return
      const seq = seqBufferRef.current.slice()
      const T = inputShapeRef.current.timesteps || 20
      const D = inputShapeRef.current.dim || (seq[seq.length - 1]?.length ?? 0)
      if (D === 0) return

      const padded = new Array(T).fill(0).map((_, i) => {
        const idx = Math.max(0, seq.length - T + i)
        const frame = seq[idx] || []
        const f = frame.slice(0, D)
        while (f.length < D) f.push(0)
        return f
      })

      const do2D = (model.inputs?.[0]?.shape?.length ?? 0) === 2
      const input: Tensor = do2D ? tf.tensor(padded[padded.length - 1]).expandDims(0) : tf.tensor(padded).expandDims(0)
      const logits = model.predict(input) as Tensor
      const probs = tf.softmax(logits)
      const data = await probs.data()
      let index = 0
      let max = Number.NEGATIVE_INFINITY
      for (let i = 0; i < data.length; i++) {
        if (data[i] > max) {
          max = data[i]
          index = i
        }
      }
      const label = labelsRef.current[index] ?? `class_${index}`
      setCurrentWord(label)
      if (max >= 0.6) {
        setSentence((s) => (s ? s + " " + label : label))
      }
      tf.dispose([input, logits, probs])
    }

    function onResults(results: MPResults, ctx: CanvasRenderingContext2D) {
      const video = videoRef.current!
      const canvas = canvasRef.current!
      ctx.save()
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      // draw video frame
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

      // simple landmarks overlay (greens + neutral gray)
      const drawPts = (lms?: MPPoint[], color = "#10B981") => {
        if (!lms) return
        ctx.fillStyle = color
        for (const lm of lms) {
          const x = (lm.x ?? 0) * canvas.width
          const y = (lm.y ?? 0) * canvas.height
          ctx.beginPath()
          ctx.arc(x, y, 2, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      drawPts(results.leftHandLandmarks, "#10B981")
      drawPts(results.rightHandLandmarks, "#16A34A")
      drawPts(results.poseLandmarks, "#64748B") // slate-500 as neutral

      ctx.restore()

      // feature + movement heuristics
      const vec = buildFeatureVector(results)
      if (!vec.length) return
      const prev = lastVecRef.current
      const movement = prev ? l1diff(vec, prev) : 0
      lastVecRef.current = vec

      const seq = seqBufferRef.current
      const maxLen = inputShapeRef.current.timesteps || 20
      seq.push(vec)
      if (seq.length > maxLen) seq.shift()

      const MOVEMENT_THRESHOLD = 0.02
      const PAUSE_MS = 600

      if (movement > MOVEMENT_THRESHOLD) {
        if (pauseTimerRef.current) {
          clearTimeout(pauseTimerRef.current)
          pauseTimerRef.current = null
        }
        return
      }

      if (!pauseTimerRef.current) {
        pauseTimerRef.current = window.setTimeout(() => {
          pauseTimerRef.current = null
          // void ensures no unhandled promise
          void predictFromBuffer()
        }, PAUSE_MS)
      }
    }

    async function setup() {
      try {
        // model + labels
        const [model, labelsJson] = await Promise.all([
          tf.loadLayersModel("/tfjs_model/model.json"),
          fetch("/labels.json")
            .then((r) => r.json())
            .catch(() => []),
        ])
        if (cancelled) return
        modelRef.current = model as LayersModel
        labelsRef.current = Array.isArray(labelsJson) ? labelsJson : labelsJson?.labels || []

        const shape = (model as LayersModel).inputs?.[0]?.shape
        if (shape) {
          inputShapeRef.current.timesteps = shape.length === 3 ? (shape[1] as number) : null
          inputShapeRef.current.dim =
            shape.length === 3 ? (shape[2] as number) : shape.length === 2 ? (shape[1] as number) : null
        }

        // camera
        const video = videoRef.current!
        const canvas = canvasRef.current!
        const ctx = canvas.getContext("2d")!

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false,
        })
        streamRef.current = stream
        video.srcObject = stream
        await video.play()
        canvas.width = video.videoWidth || 640
        canvas.height = video.videoHeight || 480

        // holistic
        let HolisticCtor: any = null
        try {
          const mod: any = await import("@mediapipe/holistic")
          HolisticCtor = mod?.Holistic ?? mod?.default?.Holistic ?? mod?.default ?? null
        } catch {
          // ignore; we'll try CDN next
        }

        if (!HolisticCtor) {
          HolisticCtor = await ensureHolisticViaCDN()
        }
        if (!HolisticCtor) throw new Error("Failed to load MediaPipe Holistic")

        const holistic = new HolisticCtor({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`,
        })
        holistic.setOptions({
          modelComplexity: 1,
          smoothLandmarks: true,
          refineFaceLandmarks: false,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
          selfieMode: true,
        })
        holistic.onResults((res: MPResults) => onResults(res, ctx))

        const loop = async () => {
          if (cancelled) return
          if (video.readyState >= 2) {
            await holistic.send({ image: video })
          }
          rafRef.current = requestAnimationFrame(loop)
        }
        loop()
      } catch (e) {
        console.log("[v0] AI setup failed:", (e as Error).message)
      }
    }

    setup()

    return () => {
      cancelled = true
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function translateIfNeeded() {
      if (!sentence) return
      try {
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: sentence, target: language }),
        })
        const data = await res.json()
        if (!cancelled && data?.translatedText) {
          setSentence(data.translatedText)
        }
      } catch (e) {
        console.log("[v0] Translate failed:", (e as Error).message)
      }
    }
    translateIfNeeded()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language])

  const contentClass = useMemo(
    () => cn("transition-all duration-500", showWelcome ? "opacity-0 translate-y-4" : "opacity-100 translate-y-0"),
    [showWelcome],
  )

  return (
    <main className="min-h-dvh bg-[#F5F3E7] text-neutral-900">
      {/* Splash screen */}
      <div
        aria-hidden={!showWelcome}
        className={[
          "fixed inset-0 z-50 flex items-center justify-center",
          "bg-[#F5F3E7] text-neutral-900",
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
          style={{ color: "#10B981" }}
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
            <div className="relative w-full">
              <div className="aspect-video w-full overflow-hidden rounded-lg border border-neutral-300 bg-white/50 backdrop-blur-sm">
                <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
                <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
              </div>
            </div>
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
              className="rounded-md border border-[#10B981]/30 bg-white/70 px-2 py-1 text-xs text-[#10B981] transition-transform duration-150 hover:scale-105 active:scale-95"
            >
              Set “Hello”
            </button>
            <button
              type="button"
              onClick={() => setCurrentWord("World")}
              className="rounded-md border border-[#10B981]/30 bg-white/70 px-2 py-1 text-xs text-[#10B981] transition-transform duration-150 hover:scale-105 active:scale-95"
            >
              Set “World”
            </button>
            <button
              type="button"
              onClick={() => setCurrentWord("")}
              className="rounded-md border border-[#10B981]/30 bg-white/70 px-2 py-1 text-xs text-[#10B981] transition-transform duration-150 hover:scale-105 active:scale-95"
            >
              Clear Word
            </button>
            <button
              type="button"
              onClick={() => setSentence((s) => (currentWord ? (s ? s + " " + currentWord : currentWord) : s))}
              className="rounded-md bg-[#10B981] px-2 py-1 text-xs text-white transition-transform duration-150 hover:scale-105 active:scale-95"
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
          setLanguage={(lang) => {
            // reset prediction on language switch to avoid confusion
            setLanguage(lang)
          }}
          sentence={sentence}
          onClear={() => {
            setCurrentWord("")
            setSentence("")
            seqBufferRef.current = []
            lastVecRef.current = null
          }}
        />

        <footer className="mt-6 text-center text-xs text-neutral-400">Built for demo. Accent color: #10B981</footer>
      </div>
    </main>
  )
}
