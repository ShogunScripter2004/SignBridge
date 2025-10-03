import { NextResponse } from "next/server"
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(req: Request) {
  try {
    // 1. Get the text and target language from the frontend's request.
    const { text, target } = await req.json()

    if (!text || !target) {
      return NextResponse.json({ error: "Missing 'text' or 'target' field" }, { status: 400 })
    }

    // 2. Securely access your Google API key from environment variables.
    // This key is NEVER exposed to the frontend.
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
        throw new Error("Missing GEMINI_API_KEY environment variable. Please set it in your .env.local file or Vercel project settings.");
    }

    // 3. Initialize the Gemini client.
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-05-20" });

    // 4. Create a clear, specific prompt for the translation task.
    const languageMap: { [key: string]: string } = {
        en: 'English',
        hi: 'Hindi',
        mr: 'Marathi'
    };
    const targetLanguageFullName = languageMap[target] || target;

    const prompt = `Translate the following English text to ${targetLanguageFullName}: "${text}"`;

    // 5. Call the Gemini API to generate the translation.
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const translatedText = response.text();

    // 6. Send the successful response back to the frontend.
    return NextResponse.json({ translatedText });

  } catch (err) {
    console.error("[TRANSLATE API ERROR]", err);
    return NextResponse.json({ error: (err as Error).message ?? "Unexpected error" }, { status: 500 })
  }
}

export async function GET() {
  // Optional: Informative no-op for GET requests
  return NextResponse.json(
    {
      message: "This endpoint translates text. Use a POST request with { text, target }.",
    },
    { status: 200 },
  )
}

