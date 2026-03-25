const QWEN_API_KEY = process.env.QWEN_API_KEY ?? "";

const MAHJONG_PROMPT = `你是香港麻雀專家。請仔細看清楚相片中每隻牌，然後：

1. 列出所有牌面（萬/筒/索/字牌）
2. 用香港計番方式計算有幾番
3. 列出所有番種及番數
4. 最後總結：X番，番種列表

請用中文回答，簡潔清楚。`;

export async function analyzeMahjong(imageBuffer: Buffer, mimeType: string): Promise<string> {
  if (!QWEN_API_KEY) throw new Error("QWEN_API_KEY not configured");

  const base64 = imageBuffer.toString("base64");
  const dataUrl = `data:${mimeType};base64,${base64}`;

  const res = await fetch(
    "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${QWEN_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "qwen-vl-plus",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: MAHJONG_PROMPT },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        max_tokens: 2000,
      }),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Qwen Vision API error: ${res.status} ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "無法分析麻雀牌面。";
}

export async function analyzeImage(imageBuffer: Buffer, mimeType: string, prompt: string): Promise<string> {
  if (!QWEN_API_KEY) throw new Error("QWEN_API_KEY not configured");

  const base64 = imageBuffer.toString("base64");
  const dataUrl = `data:${mimeType};base64,${base64}`;

  const res = await fetch(
    "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${QWEN_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "qwen-vl-plus",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        max_tokens: 2000,
      }),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Qwen Vision API error: ${res.status} ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "Failed to analyze image.";
}
