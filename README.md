# Mentra Meeting Summary

AI-powered meeting summary app for **Mentra Live** smart glasses. Records meeting conversations with speaker identification, then generates structured summaries using Qwen or MiniMax. Sends results to Telegram.

## How it works

1. Say **"Start Meeting"** (or press the button) to begin recording
2. The app captures all speech with automatic speaker identification
3. Say **"Stop Meeting"** (or press the button) to stop recording
4. Say **"Summarize"** (or long-press the button) to generate a summary
5. The AI summary is read aloud via TTS and sent to Telegram

## Voice Commands

| Command | Action |
|---------|--------|
| "Start Meeting" / "Start Recording" | Begin recording |
| "Stop Meeting" / "End Meeting" | Stop recording |
| "Meeting Status" | Hear current stats (duration, speakers, words) |
| "Summarize" / "Summary" | Generate and read the meeting summary |

## Button Controls

| Action | Function |
|--------|----------|
| Short press | Toggle recording on/off |
| Long press | Generate summary |

## LED Indicators

| Color | Meaning |
|-------|---------|
| Green | Recording in progress |
| Blue blink | Generating summary |
| Off | Idle |

## Setup

### Prerequisites

- [Bun](https://bun.sh/) runtime
- [ngrok](https://ngrok.com/) for local development
- [MentraOS](https://mentra.glass/install) on your phone
- Mentra Live glasses paired

### 1. Register the app

Go to [console.mentra.glass](https://console.mentra.glass/) and create a new app:
- Package name: `io.codemug.meetingsummary`
- Webhook URL: your Fly.io URL or ngrok URL
- Enable **Microphone** permission

### 2. Get API keys

- **Qwen**: [Alibaba Cloud DashScope](https://dashscope.console.aliyun.com/)
- **MiniMax**: [MiniMax Platform](https://platform.minimaxi.com/)

### 3. Install & run

```bash
bun install
cp .env.example .env
# Edit .env with your keys
bun run dev
```

### 4. Expose with ngrok (local dev)

```bash
ngrok http --url=<YOUR_NGROK_URL> 3000
```

### 5. Launch from MentraOS on your phone

## Configuration

Set `AI_BACKEND` in `.env` to choose the summarization engine:
- `qwen` (default) - Alibaba Qwen Plus
- `minimax` - MiniMax M2.5

## Telegram Notifications

When a meeting summary is generated, it's automatically sent to your Telegram chat. Set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in `.env`.

## Deployment (Fly.io)

```bash
fly apps create mentra-meeting-summary
fly secrets set PACKAGE_NAME=io.codemug.meetingsummary
fly secrets set MENTRAOS_API_KEY=your_key
fly secrets set QWEN_API_KEY=your_key
fly secrets set MINIMAX_API_KEY=your_key
fly secrets set AI_BACKEND=qwen
fly secrets set TELEGRAM_BOT_TOKEN=your_bot_token
fly secrets set TELEGRAM_CHAT_ID=your_chat_id
fly deploy
```

## Architecture

```
Mentra Live Glasses
    │
    ├── Microphone → MentraOS Cloud → Transcription (with speaker ID)
    │                                       │
    │                                       ▼
    │                              Your App Server (Fly.io)
    │                              ┌─────────────────┐
    │                              │ TranscriptBuffer │
    │                              │ (accumulates     │
    │                              │  speaker-labeled │
    │                              │  segments)       │
    │                              └────────┬────────┘
    │                                       │
    │                                       ▼ "Summarize"
    │                              ┌─────────────────┐
    │                              │ Qwen / MiniMax   │
    │                              │ (generates       │
    │                              │  structured      │
    │                              │  summary)        │
    │                              └────────┬────────┘
    │                                       │
    │                        ┌──────────────┼──────────────┐
    │                        ▼              ▼              ▼
    ◄── Speaker (TTS) ──────┘     Telegram Bot    SimpleStorage
```
