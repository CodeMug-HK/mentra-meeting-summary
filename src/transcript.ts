export interface TranscriptEntry {
  speaker: string;
  text: string;
  timestamp: Date;
  confidence: number;
}

export class TranscriptBuffer {
  private entries: TranscriptEntry[] = [];
  private startTime: Date | null = null;
  private speakerMap = new Map<string, string>();
  private speakerCounter = 0;

  get isRecording(): boolean {
    return this.startTime !== null;
  }

  get entryCount(): number {
    return this.entries.length;
  }

  get duration(): string {
    if (!this.startTime) return "0m";
    const ms = Date.now() - this.startTime.getTime();
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  }

  get speakerCount(): number {
    return this.speakerMap.size;
  }

  start(): void {
    this.entries = [];
    this.startTime = new Date();
    this.speakerMap.clear();
    this.speakerCounter = 0;
  }

  stop(): void {
    this.startTime = null;
  }

  addEntry(rawSpeaker: string | undefined, text: string, confidence: number): void {
    if (!this.startTime) return;

    const speakerKey = rawSpeaker ?? "unknown";
    if (!this.speakerMap.has(speakerKey)) {
      this.speakerCounter++;
      this.speakerMap.set(speakerKey, `Speaker ${this.speakerCounter}`);
    }

    this.entries.push({
      speaker: this.speakerMap.get(speakerKey)!,
      text: text.trim(),
      timestamp: new Date(),
      confidence,
    });
  }

  toTranscriptString(): string {
    if (this.entries.length === 0) return "(empty transcript)";

    const lines: string[] = [];
    let lastSpeaker = "";

    for (const entry of this.entries) {
      if (entry.speaker !== lastSpeaker) {
        lines.push(`\n[${entry.speaker}]`);
        lastSpeaker = entry.speaker;
      }
      lines.push(entry.text);
    }

    return lines.join("\n").trim();
  }

  getStats(): string {
    const speakers = [...new Set(this.entries.map((e) => e.speaker))];
    const wordCount = this.entries.reduce(
      (sum, e) => sum + e.text.split(/\s+/).length,
      0,
    );
    return `${this.duration} | ${speakers.length} speakers | ${wordCount} words | ${this.entries.length} segments`;
  }
}
