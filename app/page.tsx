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
type Language = "en" | "hi" | "mr";

export default function Page() {
  const [showWelcome, setShowWelcome] = useState(true)

  // AI & UI State
  const [currentWord, setCurrentWord] = useState<string>("")
  const [sentence, setSentence] = useState<string>("")
  const [language, setLanguage] = useState<Language>("en")
  const [translatedSentence, setTranslatedSentence] = useState<string>("")
  const [isTranslating, setIsTranslating] = useState(false)

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
        const fillEmpty = (count: number) => new Array(count * 3).fill(0);
        
        const pose_xyz = results.poseLandmarks ? results.poseLandmarks.flatMap(lm => [lm.x, lm.y, lm.z]) : fillEmpty(33);
        const lh = results.leftHandLandmarks ? results.leftHandLandmarks.flatMap(lm => [lm.x, lm.y, lm.z]) : fillEmpty(21);
        const rh = results.rightHandLandmarks ? results.rightHandLandmarks.flatMap(lm => [lm.x, lm.y, lm.z]) : fillEmpty(21);
        
        return [...pose_xyz, ...lh, ...rh];
      }

    function loadScript(src: string): Promise<void> {
      return new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null
        if (existing) {
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
      const T = inputShapeRef.current.timesteps || 45
      const D = inputShapeRef.current.dim || 258
      if (D === 0 || seq.length < 10) return

      const padded = new Array(T).fill(0).map(() => new Array(D).fill(0));
      const start = Math.max(0, T - seq.length);
      for (let i = 0; i < seq.length && i < T; i++) {
        padded[start + i] = seq[i];
      }

      const input: Tensor = tf.tensor(padded).expandDims(0)
      const logits = model.predict(input) as Tensor
      const probs = tf.softmax(logits)
      const data = await probs.data()
      
      const maxProb = Math.max(...data)
      if(maxProb < 0.7) { // Confidence threshold
        tf.dispose([input, logits, probs])
        return
      }

      const index = data.indexOf(maxProb)
      const label = labelsRef.current[index]
      
      if (label && label !== currentWord) {
          setCurrentWord(label)
          setSentence((s) => (s ? s + " " + label : label))
      }
      tf.dispose([input, logits, probs])
    }

    function onResults(results: MPResults, ctx: CanvasRenderingContext2D) {
      const video = videoRef.current!
      const canvas = canvasRef.current!
      ctx.save()
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

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
      // We don't need to draw pose landmarks for the final UI
      // drawPts(results.poseLandmarks, "#64748B")

      ctx.restore()

      const vec = buildFeatureVector(results)
      if (!vec.length) return

      const prev = lastVecRef.current
      const movement = prev ? l1diff(vec, prev) : 1
      lastVecRef.current = vec

      const seq = seqBufferRef.current
      const maxLen = inputShapeRef.current.timesteps || 45
      seq.push(vec)
      if (seq.length > maxLen) seq.shift()

      const MOVEMENT_THRESHOLD = 0.02
      const PAUSE_MS = 800

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
          void predictFromBuffer()
        }, PAUSE_MS)
      }
    }

    async function setup() {
      try {
        const [model, labelsJson] = await Promise.all([
          tf.loadLayersModel("/tfjs_model/model.json"),
          fetch("/labels.json")
            .then((r) => r.json())
            .catch(() => ({})),
        ])
        if (cancelled) return
        modelRef.current = model as LayersModel
        labelsRef.current = Object.values(labelsJson)

        const shape = (model as LayersModel).inputs?.[0]?.shape
        if (shape) {
          inputShapeRef.current.timesteps = shape.length === 3 ? (shape[1] as number) : null
          inputShapeRef.current.dim = shape.length === 3 ? (shape[2] as number) : null
        }

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

        let HolisticCtor: any = null
        try {
          const mod: any = await import("@mediapipe/holistic")
          HolisticCtor = mod?.Holistic ?? mod?.default?.Holistic ?? mod?.default ?? null
        } catch {}

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
      if (!sentence || language === 'en') {
        setTranslatedSentence(sentence) // If English is selected, just show the original sentence
        return
      }
      setIsTranslating(true)
      try {
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: sentence, target: language }),
        })
        const data = await res.json()
        if (!cancelled && data?.translatedText) {
          setTranslatedSentence(data.translatedText) // Correctly update the dedicated translation state
        }
      } catch (e) {
        console.log("[v0] Translate failed:", (e as Error).message)
      } finally {
        if (!cancelled) setIsTranslating(false)
      }
    }
    translateIfNeeded()
    return () => {
      cancelled = true
    }
  }, [sentence, language])

  const contentClass = useMemo(
    () => cn("transition-all duration-500", showWelcome ? "opacity-0 translate-y-4" : "opacity-100 translate-y-0"),
    [showWelcome],
  )

  return (
    <main className="min-h-dvh bg-[#F5F3E7] text-neutral-900">
      {/* Splash screen */}
      <div
        aria-hidden={!showWelcome}
        className={cn(
          "fixed inset-0 z-50 flex items-center justify-center",
          "bg-[#F5F3E7] text-neutral-900",
          "transition-opacity duration-500",
          showWelcome ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        )}
      >
        <div
          className={cn(
            "text-4xl font-semibold tracking-wide select-none",
            "transition-transform duration-500",
            showWelcome ? "scale-100" : "scale-95",
          )}
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
            Real-Time ISL Translator
          </p>
        </header>

        {/* Camera Card */}
        <ClearCard className="mb-4">
          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-neutral-700">Camera</h2>
            <div className="relative w-full">
              <div className="aspect-video w-full overflow-hidden rounded-lg border border-neutral-300 bg-white/50 backdrop-blur-sm">
                <video ref={videoRef} className="h-full w-full object-cover" playsInline muted style={{transform: 'scaleX(-1)'}} />
                <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
              </div>
            </div>
          </div>
        </ClearCard>

        {/* Current Word */}
        <ClearCard className="mb-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-neutral-700">Current Word</h2>
            <span className="text-sm text-neutral-500">Live</span>
          </div>
          <div className="mt-2 min-h-10 flex items-center justify-center rounded-md bg-white/70 px-3 py-2 text-xl font-semibold backdrop-blur">
            {currentWord || <span className="text-neutral-400">Awaiting prediction…</span>}
          </div>
        </ClearCard>

        {/* Full Sentence (English) */}
        <ClearCard className="mb-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-neutral-700">Detected Sentence (English)</h2>
          </div>
          <div className="mt-2 min-h-14 rounded-md bg-white/70 px-3 py-2 text-neutral-900 backdrop-blur">
            {sentence || <span className="text-neutral-400">Your sentence will build here…</span>}
          </div>
        </ClearCard>
        
        {/* Translated Sentence */}
        <ClearCard className="mb-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-neutral-700">Translation</h2>
          </div>
          <div className="mt-2 min-h-14 rounded-md bg-white/70 px-3 py-2 text-neutral-900 backdrop-blur">
            {isTranslating ? <span className="text-neutral-400">Translating...</span> : (translatedSentence || <span className="text-neutral-400">Select a language to translate.</span>)}
          </div>
        </ClearCard>

        {/* Controls */}
        <ControlsCard
          language={language}
          setLanguage={(lang) => setLanguage(lang)}
          sentence={translatedSentence || sentence}
          onClear={() => {
            setCurrentWord("")
            setSentence("")
            setTranslatedSentence("")
            seqBufferRef.current = []
            lastVecRef.current = null
          }}
        />

        <footer className="mt-6 text-center text-xs text-neutral-400">Sign Bridge Project</footer>
      </div>
    </main>
  )
}

