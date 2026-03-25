import { GoogleGenAI } from "@google/genai";

export type AIBackend = "gemini" | "qwen";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
const QWEN_API_KEY = process.env.QWEN_API_KEY ?? "";

const gemini = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

const SUMMARY_PROMPT = `You are a meeting summarizer. Given a transcript with speaker labels, produce a structured meeting summary.

Format your response EXACTLY as:

MEETING SUMMARY
Duration: <duration>
Participants: <comma-separated speaker labels>

KEY POINTS
- <point 1>
- <point 2>
...

ACTION ITEMS
- [Speaker] <action item>
...

DECISIONS
- <decision made>
...

Keep it concise. If no clear action items or decisions, omit those sections.`;

export async function generateSummary(
  transcript: string,
  backend: AIBackend,
): Promise<string> {
  const prompt = `${SUMMARY_PROMPT}\n\nTRANSCRIPT:\n${transcript}`;

  if (backend === "gemini") {
    return summarizeWithGemini(prompt);
  }
  return summarizeWithQwen(prompt);
}

async function summarizeWithGemini(prompt: string): Promise<string> {
  if (!gemini) throw new Error("GEMINI_API_KEY not configured");

  const response = await gemini.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { maxOutputTokens: 1000 },
  });

  return response.text ?? "Failed to generate summary.";
}

async function summarizeWithQwen(prompt: string): Promise<string> {
  if (!QWEN_API_KEY) throw new Error("QWEN_API_KEY not configured");

  const res = await fetch(
    "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${QWEN_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "qwen-plus",
        messages: [
          { role: "system", content: "You are a meeting summarizer." },
          { role: "user", content: prompt },
        ],
        max_tokens: 1000,
      }),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Qwen API error: ${res.status} ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "Failed to generate summary.";
}
