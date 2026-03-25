export type AIBackend = "qwen" | "minimax";

const QWEN_API_KEY = process.env.QWEN_API_KEY ?? "";
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY ?? "";

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

  if (backend === "minimax") {
    return summarizeWithMinimax(prompt);
  }
  return summarizeWithQwen(prompt);
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

async function summarizeWithMinimax(prompt: string): Promise<string> {
  if (!MINIMAX_API_KEY) throw new Error("MINIMAX_API_KEY not configured");

  const res = await fetch(
    "https://api.minimaxi.com/v1/text/chatcompletion_v2",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${MINIMAX_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "MiniMax-M2.5",
        messages: [
          { role: "system", content: "You are a meeting summarizer." },
          { role: "user", content: prompt },
        ],
        max_completion_tokens: 1000,
        temperature: 0.7,
      }),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`MiniMax API error: ${res.status} ${err}`);
  }

  const data = await res.json();
  return (
    data.choices?.[0]?.message?.content ??
    data.reply ??
    "Failed to generate summary."
  );
}
