import { AppServer, AppSession } from "@mentra/sdk";
import { TranscriptBuffer } from "./transcript";
import { generateSummary, type AIBackend } from "./ai";
import { sendTelegramMessage } from "./telegram";

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
const AI_BACKEND = (process.env.AI_BACKEND || "gemini") as AIBackend;

interface SessionState {
  session: AppSession;
  transcript: TranscriptBuffer;
  summarizing: boolean;
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
    };
    this.sessions.set(sessionId, state);

    session.logger.info(`User ${userId} connected`);
    await session.audio.speak("Meeting Summary ready. Say Start Meeting to begin recording.");

    // Button: short press = start/stop recording, long press = summarize
    session.events.onButtonPress((data) => {
      session.logger.info(`Button: ${data.pressType}`);

      if (data.pressType === "long") {
        this.handleSummarize(state, sessionId);
        return;
      }

      // Short press toggles recording
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

      // Only process final transcriptions for commands
      if (!data.isFinal) return;

      // Check for voice commands when NOT recording
      if (!state.transcript.isRecording) {
        if (textLower.includes("start meeting") || textLower.includes("start recording")) {
          this.startRecording(state, sessionId);
          return;
        }
        if (textLower.includes("summarize") || textLower.includes("summary")) {
          this.handleSummarize(state, sessionId);
          return;
        }
        return;
      }

      // While recording: check for stop/summarize commands
      if (textLower.includes("stop meeting") || textLower.includes("stop recording") || textLower.includes("end meeting")) {
        this.stopRecording(state, sessionId);
        return;
      }

      if (textLower.includes("meeting status")) {
        const stats = state.transcript.getStats();
        session.audio.speak(stats);
        session.logger.info(`[${sessionId}] Status: ${stats}`);
        return;
      }

      // Record the transcription (speakerId is optional in TranscriptionData)
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

  private startRecording(state: SessionState, sessionId: string): void {
    state.transcript.start();
    state.session.audio.speak("Recording started.");
    state.session.logger.info(`[${sessionId}] Recording started`);

    // Solid green LED to indicate recording
    if (state.session.capabilities?.hasLight) {
      state.session.led?.solid("green", 3600000); // 1 hour max
    }
  }

  private stopRecording(state: SessionState, sessionId: string): void {
    state.transcript.stop();
    const stats = state.transcript.getStats();
    state.session.audio.speak(`Recording stopped. ${stats}. Say Summarize to generate summary.`);
    state.session.logger.info(`[${sessionId}] Recording stopped: ${stats}`);

    // Turn off LED
    if (state.session.capabilities?.hasLight) {
      state.session.led?.turnOff();
    }
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

    // Stop recording if still active
    if (state.transcript.isRecording) {
      state.transcript.stop();
    }

    state.summarizing = true;
    state.session.audio.speak("Generating meeting summary. This may take a moment.");
    state.session.logger.info(`[${sessionId}] Generating summary with ${AI_BACKEND}...`);

    // Blink blue LED while summarizing
    if (state.session.capabilities?.hasLight) {
      state.session.led?.blink("blue", 500, 500, 60);
    }

    try {
      const transcriptText = state.transcript.toTranscriptString();
      state.session.logger.info(`[${sessionId}] Transcript:\n${transcriptText}`);

      const summary = await generateSummary(transcriptText, AI_BACKEND);
      state.session.logger.info(`[${sessionId}] Summary:\n${summary}`);

      // Read summary aloud via TTS
      await state.session.audio.speak(summary);

      // Send summary to Telegram
      const telegramMsg = `*Meeting Summary*\n${state.transcript.getStats()}\n\n${summary}`;
      sendTelegramMessage(telegramMsg).catch((err) =>
        state.session.logger.error(`[${sessionId}] Telegram error: ${err}`),
      );

      // Store summary for retrieval
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

  protected async onStop(sessionId: string, userId: string, reason: string): Promise<void> {
    this.sessions.delete(sessionId);
    console.log(`[${sessionId}] Session ended: ${reason}`);
  }
}

const app = new MeetingSummaryApp();
app.start().catch(console.error);
