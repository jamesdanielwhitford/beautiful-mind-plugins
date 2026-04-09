const ENDPOINT = "https://api.mistral.ai/v1/audio/transcriptions";
const MODEL = "voxtral-mini-latest";
const MAX_RETRIES = 4;

export type TranscribeResult =
  | { ok: true; text: string }
  | { ok: false; error: string };

export async function transcribeAudio(
  apiKey: string,
  fileName: string,
  audioData: ArrayBuffer,
  mimeType: string
): Promise<TranscribeResult> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    let response: Response;

    try {
      const formData = new FormData();
      const blob = new Blob([audioData], { type: mimeType });
      formData.append("file", blob, fileName);
      formData.append("model", MODEL);

      response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: formData,
      });
    } catch (err) {
      // Network-level error (offline, DNS failure, etc.)
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `Network error: ${message}` };
    }

    if (response.status === 503) {
      if (attempt < MAX_RETRIES - 1) {
        const waitMs = Math.pow(2, attempt) * 1000;
        console.log(
          `Voice Transcriber: 503 from Mistral, retrying in ${waitMs / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES})`
        );
        await sleep(waitMs);
        continue;
      } else {
        return {
          ok: false,
          error: "Mistral server is unavailable (503). Try again shortly.",
        };
      }
    }

    if (response.status === 401) {
      return { ok: false, error: "Invalid API key. Check your settings." };
    }

    if (response.status === 429) {
      return {
        ok: false,
        error: "Mistral rate limit reached. Try again in a moment.",
      };
    }

    if (!response.ok) {
      let detail = "";
      try {
        const body = await response.json();
        detail = body?.message ?? body?.error ?? "";
      } catch {
        // ignore parse failure
      }
      return {
        ok: false,
        error: `Mistral API error ${response.status}${detail ? ": " + detail : ""}`,
      };
    }

    let json: { text?: string };
    try {
      json = await response.json();
    } catch {
      return { ok: false, error: "Failed to parse Mistral API response." };
    }

    const text = (json.text ?? "").trim();
    if (!text) {
      return { ok: false, error: "empty" };
    }

    return { ok: true, text };
  }

  return { ok: false, error: "Unexpected transcription failure." };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
