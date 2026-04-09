import { Notice, Plugin, TFile, TFolder, normalizePath } from "obsidian";
import {
  VoiceTranscriberSettings,
  VoiceTranscriberSettingTab,
  DEFAULT_SETTINGS,
} from "./settings";
import { transcribeAudio } from "./transcribe";

const AUDIO_EXTENSIONS = ["m4a", "mp3", "wav", "webm", "ogg", "flac"];

const MIME_TYPES: Record<string, string> = {
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  webm: "audio/webm",
  ogg: "audio/ogg",
  flac: "audio/flac",
};

export default class VoiceTranscriberPlugin extends Plugin {
  settings: VoiceTranscriberSettings;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new VoiceTranscriberSettingTab(this.app, this));

    this.addRibbonIcon("microphone", "Transcribe voice notes", async () => {
      await this.processInbox();
    });

    this.addCommand({
      id: "transcribe-inbox",
      name: "Transcribe voice notes in inbox",
      callback: async () => {
        await this.processInbox();
      },
    });

    if (this.settings.triggerMode === "onload") {
      // Wait for vault to be ready before scanning
      this.app.workspace.onLayoutReady(async () => {
        await this.processInbox();
      });
    }
  }

  async processInbox() {
    if (!this.settings.mistralApiKey) {
      new Notice(
        "Voice Transcriber: No API key set. Add your Mistral API key in settings."
      );
      return;
    }

    const inboxPath = normalizePath(this.settings.inboxFolder);
    const processedPath = normalizePath(this.settings.processedFolder);

    await this.ensureFolder(inboxPath);
    await this.ensureFolder(processedPath);

    const inboxFolder = this.app.vault.getFolderByPath(inboxPath);
    if (!inboxFolder) {
      new Notice(`Voice Transcriber: Could not access inbox folder "${inboxPath}".`);
      return;
    }

    const audioFiles = inboxFolder.children.filter(
      (f): f is TFile =>
        f instanceof TFile &&
        AUDIO_EXTENSIONS.includes(f.extension.toLowerCase())
    );

    if (audioFiles.length === 0) {
      new Notice("Voice Transcriber: No audio files found in inbox.");
      return;
    }

    new Notice(`Voice Transcriber: Processing ${audioFiles.length} file(s)...`);

    let succeeded = 0;
    let failed = 0;

    for (const file of audioFiles) {
      const result = await this.transcribeFile(file, processedPath);
      if (result) {
        succeeded++;
      } else {
        failed++;
      }
    }

    const parts: string[] = [];
    if (succeeded > 0) parts.push(`${succeeded} transcribed`);
    if (failed > 0) parts.push(`${failed} failed`);
    new Notice(`Voice Transcriber: Done. ${parts.join(", ")}.`);
  }

  private async transcribeFile(
    file: TFile,
    processedPath: string
  ): Promise<boolean> {
    const ext = file.extension.toLowerCase();
    const mimeType = MIME_TYPES[ext] ?? "audio/mpeg";

    let audioData: ArrayBuffer;
    try {
      audioData = await this.app.vault.readBinary(file);
    } catch (err) {
      new Notice(`Voice Transcriber: Failed to read "${file.name}".`);
      console.error("Voice Transcriber read error:", err);
      return false;
    }

    const result = await transcribeAudio(
      this.settings.mistralApiKey,
      file.name,
      audioData,
      mimeType
    );

    if (!result.ok) {
      if (result.error === "empty") {
        new Notice(
          `Voice Transcriber: No speech detected in "${file.name}". File left in inbox.`
        );
      } else {
        new Notice(`Voice Transcriber: "${file.name}" failed. ${result.error}`);
      }
      console.error(`Voice Transcriber error for ${file.name}:`, result.error);
      return false;
    }

    // Build note content
    const basename = file.basename;
    const now = new Date().toISOString();
    const noteContent = `---\nsource: ${file.name}\ntranscribed: ${now}\n---\n\n${result.text}\n`;

    // Find a unique note path at vault root
    const notePath = await this.uniqueNotePath(basename);

    try {
      await this.app.vault.create(notePath, noteContent);
    } catch (err) {
      new Notice(`Voice Transcriber: Failed to create note for "${file.name}".`);
      console.error("Voice Transcriber note creation error:", err);
      return false;
    }

    // Move audio to processed folder
    const destPath = normalizePath(`${processedPath}/${file.name}`);
    try {
      await this.app.vault.rename(file, destPath);
    } catch (err) {
      new Notice(
        `Voice Transcriber: Transcribed "${file.name}" but could not move it to processed.`
      );
      console.error("Voice Transcriber move error:", err);
      // Still return true since the note was created
    }

    return true;
  }

  private async uniqueNotePath(basename: string): Promise<string> {
    const candidate = normalizePath(`${basename}.md`);
    if (!this.app.vault.getFileByPath(candidate)) {
      return candidate;
    }
    let counter = 1;
    while (true) {
      const numbered = normalizePath(`${basename}-${counter}.md`);
      if (!this.app.vault.getFileByPath(numbered)) {
        return numbered;
      }
      counter++;
    }
  }

  private async ensureFolder(path: string) {
    const existing = this.app.vault.getFolderByPath(path);
    if (!existing) {
      try {
        await this.app.vault.createFolder(path);
      } catch {
        // May already exist due to race; ignore
      }
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
