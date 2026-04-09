import { App, PluginSettingTab, Setting } from "obsidian";
import type VoiceTranscriberPlugin from "./main";

export type TriggerMode = "onload" | "manual";

export interface VoiceTranscriberSettings {
  mistralApiKey: string;
  triggerMode: TriggerMode;
  inboxFolder: string;
  processedFolder: string;
}

export const DEFAULT_SETTINGS: VoiceTranscriberSettings = {
  mistralApiKey: "",
  triggerMode: "onload",
  inboxFolder: "Voice Notes/inbox",
  processedFolder: "Voice Notes/processed",
};

export class VoiceTranscriberSettingTab extends PluginSettingTab {
  plugin: VoiceTranscriberPlugin;

  constructor(app: App, plugin: VoiceTranscriberPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Mistral API key")
      .setDesc("Your Mistral API key for Voxtral transcription.")
      .addText((text) =>
        text
          .setPlaceholder("Enter API key")
          .setValue(this.plugin.settings.mistralApiKey)
          .onChange(async (value) => {
            this.plugin.settings.mistralApiKey = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Trigger mode")
      .setDesc("When to process audio files in the inbox folder.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("onload", "On plugin load")
          .addOption("manual", "Manual (ribbon button only)")
          .setValue(this.plugin.settings.triggerMode)
          .onChange(async (value) => {
            this.plugin.settings.triggerMode = value as TriggerMode;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Inbox folder")
      .setDesc("Folder to watch for new audio files.")
      .addText((text) =>
        text
          .setPlaceholder("Voice Notes/inbox")
          .setValue(this.plugin.settings.inboxFolder)
          .onChange(async (value) => {
            this.plugin.settings.inboxFolder = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Processed folder")
      .setDesc("Folder to move audio files to after transcription.")
      .addText((text) =>
        text
          .setPlaceholder("Voice Notes/processed")
          .setValue(this.plugin.settings.processedFolder)
          .onChange(async (value) => {
            this.plugin.settings.processedFolder = value.trim();
            await this.plugin.saveSettings();
          })
      );
  }
}
