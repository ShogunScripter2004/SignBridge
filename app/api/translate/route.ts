import { NextResponse } from "next/server"

export async function POST(req: Request) {
  try {
    const { text, target } = await req.json()

    if (!text || !target) {
      return NextResponse.json({ error: "Missing 'text' or 'target' field" }, { status: 400 })
    }

    // Access your Google API key (ensure it's set in Vercel Project Settings):
    // Example (choose your preferred variable naming):
    // const apiKey = process.env.GOOGLE_API_KEY
    // if (!apiKey) throw new Error("Missing GOOGLE_API_KEY")

    // Here you would call Google Translate API:
    // const res = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${apiKey}`, { ... })
    // const json = await res.json()

    // For now, return a mock response
    const mock = {
      originalText: text,
      target,
      translatedText: `[mock] ${text} → (${target.toUpperCase()})`,
    }

    return NextResponse.json(mock)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message ?? "Unexpected error" }, { status: 500 })
  }
}

export async function GET() {
  // Optional: Informative no-op for GET requests
  return NextResponse.json(
    {
      message: "POST { text, target } to translate. This is a placeholder endpoint.",
    },
    { status: 200 },
  )
}
