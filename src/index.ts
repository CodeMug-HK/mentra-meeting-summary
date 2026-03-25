import { AppServer, AppSession } from "@mentra/sdk";
import { TranscriptBuffer } from "./transcript";
import { generateSummary, type AIBackend } from "./ai";
import { analyzeMahjong } from "./vision";
import { sendTelegramMessage, sendTelegramPhoto } from "./telegram";

const PACKAGE_NAME =
  process.env.PACKAGE_NAME ??
  (() => {
    throw new Error("PACKAGE_NAME is not set");
  })();
const MENTRAOS_API_KEY =
  process.env.MENTRAOS_API_KEY ??
  (() => {
    throw new Error("MENTRAOS_API_KEY is not set");
  })();
const PORT = parseInt(process.env.PORT || "3000");
const AI_BACKEND = (process.env.AI_BACKEND || "qwen") as AIBackend;

interface SessionState {
  session: AppSession;
  transcript: TranscriptBuffer;
  summarizing: boolean;
  analyzing: boolean;
}

class MeetingSummaryApp extends AppServer {
  private sessions = new Map<string, SessionState>();

  constructor() {
    super({
      packageName: PACKAGE_NAME,
      apiKey: MENTRAOS_API_KEY,
      port: PORT,
      publicDir: "public",
    });
  }

  protected async onSession(
    session: AppSession,
    sessionId: string,
    userId: string,
  ): Promise<void> {
    const state: SessionState = {
      session,
      transcript: new TranscriptBuffer(),
      summarizing: false,
      analyzing: false,
    };
    this.sessions.set(sessionId, state);

    session.logger.info(`User ${userId} connected`);
    await session.audio.speak("Ready. Say Start Meeting, or say Mahjong to analyze tiles.");

    // Button: short press = start/stop recording, long press = summarize
    session.events.onButtonPress((data) => {
      session.logger.info(`Button: ${data.pressType}`);

      if (data.pressType === "long") {
        if (state.transcript.isRecording) {
          this.stopRecording(state, sessionId);
        } else {
          this.handleSummarize(state, sessionId);
        }
        return;
      }

      // Short press: toggle recording or take mahjong photo
      if (state.transcript.isRecording) {
        this.stopRecording(state, sessionId);
      } else {
        this.startRecording(state, sessionId);
      }
    });

    // Voice commands
    session.events.onTranscription((data) => {
      const text = data.text.trim();
      const textLower = text.toLowerCase();

      // Log all final transcriptions for debugging
      if (data.isFinal) {
        session.logger.info(`[${sessionId}] Transcription (final, recording=${state.transcript.isRecording}): "${text}"`);
      }

      if (!data.isFinal) return;

      // === Global commands (work anytime) ===
      if (textLower.includes("mahjong") || textLower.includes("麻雀") || textLower.includes("ma jong") || textLower.includes("mah jong") || textLower.includes("ma chong") || textLower.includes("ma cheng")) {
        this.handleMahjong(state, sessionId);
        return;
      }

      // === Commands when NOT recording ===
      if (!state.transcript.isRecording) {
        if (
          textLower.includes("start meeting") ||
          textLower.includes("start recording") ||
          textLower.includes("begin meeting") ||
          textLower.includes("record")
        ) {
          this.startRecording(state, sessionId);
          return;
        }
        if (textLower.includes("summarize") || textLower.includes("summary")) {
          this.handleSummarize(state, sessionId);
          return;
        }
        return;
      }

      // === Commands while recording ===
      if (
        textLower.includes("stop meeting") ||
        textLower.includes("stop recording") ||
        textLower.includes("end meeting") ||
        textLower.includes("end recording")
      ) {
        this.stopRecording(state, sessionId);
        return;
      }

      if (textLower.includes("meeting status")) {
        const stats = state.transcript.getStats();
        session.audio.speak(stats);
        return;
      }

      // Record the transcription
      state.transcript.addEntry(
        data.speakerId,
        text,
        data.confidence ?? 1,
      );
      session.logger.info(
        `[${sessionId}] [${data.speakerId ?? "?"}] ${text}`,
      );
    });
  }

  // ========== Meeting Recording ==========

  private startRecording(state: SessionState, sessionId: string): void {
    state.transcript.start();
    state.session.audio.speak("Recording started.");
    state.session.logger.info(`[${sessionId}] Recording started`);

    if (state.session.capabilities?.hasLight) {
      state.session.led?.solid("green", 3600000);
    }
  }

  private stopRecording(state: SessionState, sessionId: string): void {
    state.transcript.stop();
    const stats = state.transcript.getStats();
    state.session.audio.speak(`Recording stopped. ${stats}. Generating summary now.`);
    state.session.logger.info(`[${sessionId}] Recording stopped: ${stats}`);

    if (state.session.capabilities?.hasLight) {
      state.session.led?.turnOff();
    }

    this.handleSummarize(state, sessionId);
  }

  private async handleSummarize(state: SessionState, sessionId: string): Promise<void> {
    if (state.summarizing) {
      state.session.audio.speak("Already generating summary. Please wait.");
      return;
    }

    if (state.transcript.entryCount === 0) {
      state.session.audio.speak("No transcript recorded yet. Start a meeting first.");
      return;
    }

    if (state.transcript.isRecording) {
      state.transcript.stop();
    }

    state.summarizing = true;
    state.session.audio.speak("Generating meeting summary.");
    state.session.logger.info(`[${sessionId}] Generating summary with ${AI_BACKEND}...`);

    if (state.session.capabilities?.hasLight) {
      state.session.led?.blink("blue", 500, 500, 60);
    }

    try {
      const transcriptText = state.transcript.toTranscriptString();
      state.session.logger.info(`[${sessionId}] Transcript:\n${transcriptText}`);

      const summary = await generateSummary(transcriptText, AI_BACKEND);
      state.session.logger.info(`[${sessionId}] Summary:\n${summary}`);

      await state.session.audio.speak(summary);

      const telegramMsg = `*Meeting Summary*\n${state.transcript.getStats()}\n\n${summary}`;
      sendTelegramMessage(telegramMsg).catch((err) =>
        state.session.logger.error(`[${sessionId}] Telegram error: ${err}`),
      );

      await state.session.simpleStorage?.set(
        `summary-${Date.now()}`,
        JSON.stringify({
          timestamp: new Date().toISOString(),
          stats: state.transcript.getStats(),
          transcript: transcriptText,
          summary,
          backend: AI_BACKEND,
        }),
      );
    } catch (err) {
      state.session.logger.error(`[${sessionId}] Summary error: ${err}`);
      state.session.audio.speak("Sorry, failed to generate summary. Please try again.");
    } finally {
      state.summarizing = false;
      if (state.session.capabilities?.hasLight) {
        state.session.led?.turnOff();
      }
    }
  }

  // ========== Mahjong Analysis ==========

  private async handleMahjong(state: SessionState, sessionId: string): Promise<void> {
    if (state.analyzing) {
      state.session.audio.speak("Already analyzing. Please wait.");
      return;
    }

    if (!state.session.capabilities?.hasCamera) {
      state.session.audio.speak("No camera available on this device.");
      return;
    }

    state.analyzing = true;
    state.session.audio.speak("Taking photo of mahjong tiles.");
    state.session.logger.info(`[${sessionId}] Mahjong: taking photo...`);

    if (state.session.capabilities?.hasLight) {
      state.session.led?.blink("orange", 300, 300, 30);
    }

    try {
      const photo = await state.session.camera.requestPhoto({
        size: "large",
        compress: "medium",
      });

      state.session.logger.info(`[${sessionId}] Mahjong: photo received (${photo.size} bytes), analyzing...`);
      state.session.audio.speak("Photo taken. Analyzing tiles now.");

      const result = await analyzeMahjong(photo.buffer, photo.mimeType);
      state.session.logger.info(`[${sessionId}] Mahjong result:\n${result}`);

      // Read result aloud
      await state.session.audio.speak(result);

      // Send photo + result to Telegram
      sendTelegramPhoto(photo.buffer, `mahjong_${Date.now()}.jpg`, result).catch((err) =>
        state.session.logger.error(`[${sessionId}] Telegram photo error: ${err}`),
      );
    } catch (err) {
      state.session.logger.error(`[${sessionId}] Mahjong error: ${err}`);
      state.session.audio.speak("Sorry, failed to analyze mahjong tiles. Please try again.");
    } finally {
      state.analyzing = false;
      if (state.session.capabilities?.hasLight) {
        state.session.led?.turnOff();
      }
    }
  }

  protected async onStop(sessionId: string, userId: string, reason: string): Promise<void> {
    this.sessions.delete(sessionId);
    console.log(`[${sessionId}] Session ended: ${reason}`);
  }
}

const app = new MeetingSummaryApp();
app.start().catch(console.error);
