import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';

const DEFAULT_MIMO_BASE_URL = 'https://api.xiaomimimo.com/v1';
const DEFAULT_MIMO_TTS_MODEL = 'mimo-v2-tts';
const DEFAULT_MIMO_TTS_FORMAT = 'mp3';
const DEFAULT_MIMO_TTS_VOICE = 'default_en';
const MAX_TTS_TEXT_LENGTH = 1200;

type MimoTTSResult = {
  audio: Buffer;
  mimeType: string;
  cached: boolean;
};

function getStorageRoot() {
  return process.env.STORAGE_LOCAL_ROOT || './storage';
}

function getCachePath(text: string, model: string, voice: string, format: string) {
  const digest = createHash('sha256')
    .update([model, voice, format, text].join('\n'))
    .digest('hex');

  return path.join(process.cwd(), getStorageRoot(), 'tts', 'mimo', `${digest}.${format}`);
}

function getMimeType(format: string) {
  switch (format.toLowerCase()) {
    case 'wav':
      return 'audio/wav';
    case 'ogg':
      return 'audio/ogg';
    case 'aac':
      return 'audio/aac';
    case 'mp3':
    default:
      return 'audio/mpeg';
  }
}

function normalizeText(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

function extractAudioData(data: any) {
  return (
    data?.choices?.[0]?.message?.audio?.data ||
    data?.choices?.[0]?.delta?.audio?.data ||
    data?.audio?.data ||
    data?.data
  );
}

function buildPayload(text: string, model: string, voice: string, format: string) {
  return {
    model,
    messages: [
      {
        role: 'assistant',
        content: text,
      },
    ],
    modalities: ['audio'],
    audio: {
      voice,
      format,
    },
  };
}

export class MimoTTSService {
  async synthesize(text: string): Promise<MimoTTSResult> {
    const normalizedText = normalizeText(text);

    if (!normalizedText) {
      throw new Error('Text is required for pronunciation.');
    }

    if (normalizedText.length > MAX_TTS_TEXT_LENGTH) {
      throw new Error(`Pronunciation text is too long. Max ${MAX_TTS_TEXT_LENGTH} characters.`);
    }

    const apiKey = process.env.MIMO_API_KEY?.trim();
    if (!apiKey) {
      throw new Error('Mimo TTS API key is not configured.');
    }

    const baseUrl = (process.env.MIMO_BASE_URL || DEFAULT_MIMO_BASE_URL).replace(/\/$/, '');
    const model = process.env.MIMO_TTS_MODEL || DEFAULT_MIMO_TTS_MODEL;
    const format = process.env.MIMO_TTS_FORMAT || DEFAULT_MIMO_TTS_FORMAT;
    const voice = process.env.MIMO_TTS_VOICE || DEFAULT_MIMO_TTS_VOICE;
    const mimeType = getMimeType(format);
    const cachePath = getCachePath(normalizedText, model, voice, format);

    try {
      const cachedAudio = await fs.readFile(cachePath);
      return {
        audio: cachedAudio,
        mimeType,
        cached: true,
      };
    } catch {}

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'api-key': apiKey,
      },
      body: JSON.stringify(buildPayload(normalizedText, model, voice, format)),
    });

    const responseText = await response.text();

    if (!response.ok) {
      throw new Error(
        `Mimo TTS API error ${response.status}: ${responseText.slice(0, 300)}`
      );
    }

    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch (error) {
      throw new Error(`Mimo TTS returned invalid JSON: ${(error as Error).message}`);
    }

    const audioData = extractAudioData(data);
    if (!audioData || typeof audioData !== 'string') {
      throw new Error('Mimo TTS returned no audio data.');
    }

    const audio = Buffer.from(audioData, 'base64');
    if (audio.length === 0) {
      throw new Error('Mimo TTS returned empty audio data.');
    }

    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    await fs.writeFile(cachePath, audio);

    return {
      audio,
      mimeType,
      cached: false,
    };
  }
}

export const mimoTTSService = new MimoTTSService();
