import {
  AIProviderInterface,
  AICompletionRequest,
  AICompletionResponse,
  AICompletionStreamChunk,
} from '@/types/ai';
import { createChildLogger } from '@/lib/logger';
import { delay } from '@/lib/utils';

const log = createChildLogger('gemini-provider');

interface GeminiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  timeoutMs: number;
  retryCount: number;
}

type GeminiUsage = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
  thoughtsTokenCount?: number;
};

/**
 * Gemini provider using Google's generateContent REST API.
 */
export class GeminiProvider implements AIProviderInterface {
  readonly providerKey = 'gemini';
  private config: GeminiConfig;
  private outputTokenLimitPromise: Promise<number | null> | null = null;

  constructor(config: GeminiConfig) {
    this.config = config;
  }

  async complete(request: AICompletionRequest): Promise<AICompletionResponse> {
    const startTime = Date.now();
    let lastError: Error | null = null;
    const maxAttempts = Math.min(this.config.retryCount + 1, 3);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await this.callApi(request);
        const latencyMs = Date.now() - startTime;

        log.info(
          {
            model: this.config.model,
            attempt,
            latencyMs,
            tokens: response.usage,
          },
          'Gemini completion succeeded'
        );

        return {
          ...response,
          latencyMs,
          provider: this.providerKey,
        };
      } catch (error) {
        lastError = error as Error;
        log.warn(
          { attempt, maxAttempts, error: (error as Error).message },
          'Gemini completion attempt failed'
        );

        if (attempt < maxAttempts && this.shouldRetry(error as Error)) {
          const errorMessage = (error as Error).message;
          const backoffMs =
            errorMessage.includes('429') || errorMessage.includes('503')
              ? Math.min(5000 * Math.pow(2, attempt - 1), 15000)
              : Math.min(750 * Math.pow(2, attempt - 1), 2500);
          await delay(backoffMs);
          continue;
        }

        break;
      }
    }

    throw new Error(
      `Gemini completion failed after ${maxAttempts} attempts: ${lastError?.message}`
    );
  }

  async *stream(
    request: AICompletionRequest
  ): AsyncIterable<AICompletionStreamChunk> {
    const startTime = Date.now();
    let emittedCharacters = 0;

    for await (const chunk of this.callStreamApi(request)) {
      emittedCharacters += chunk.content.length;
      yield chunk;
    }

    log.info(
      {
        model: this.config.model,
        latencyMs: Date.now() - startTime,
        emittedCharacters,
      },
      'Gemini stream completed'
    );
  }

  private async callApi(
    request: AICompletionRequest
  ): Promise<Omit<AICompletionResponse, 'latencyMs' | 'provider'>> {
    const baseUrl = this.config.baseUrl.replace(/\/$/, '');
    const model = encodeURIComponent(this.config.model);
    const url = `${baseUrl}/models/${model}:generateContent?key=${encodeURIComponent(this.config.apiKey)}`;
    const requestedMaxOutputTokens =
      request.maxTokens ?? this.config.maxTokens;
    const modelOutputTokenLimit = await this.getModelOutputTokenLimit();
    const maxOutputTokens = modelOutputTokenLimit
      ? Math.min(requestedMaxOutputTokens, modelOutputTokenLimit)
      : requestedMaxOutputTokens;

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.timeoutMs
    );

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: request.systemPrompt }],
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: request.userPrompt }],
            },
          ],
          generationConfig: {
            temperature: request.temperature ?? this.config.temperature,
            topP: request.topP ?? this.config.topP,
            maxOutputTokens,
            responseMimeType: 'application/json',
            thinkingConfig: this.config.model.includes('gemini-3')
              ? { thinkingLevel: 'minimal' }
              : { thinkingBudget: 0 },
          },
        }),
        signal: controller.signal,
      });

      const responseText = await response.text();

      if (!response.ok) {
        throw new Error(
          `Gemini API error ${response.status}: ${responseText.slice(0, 400)}`
        );
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.toLowerCase().includes('application/json')) {
        throw new Error(
          `Gemini returned a non-JSON response: ${responseText.slice(0, 160)}`
        );
      }

      let data: any;
      try {
        data = JSON.parse(responseText);
      } catch (error) {
        throw new Error(
          `Gemini returned invalid JSON: ${(error as Error).message}`
        );
      }

      const text = data.candidates?.[0]?.content?.parts
        ?.map((part: { text?: string }) => part.text || '')
        .join('')
        .trim();

      if (!text) {
        const blockReason =
          data.candidates?.[0]?.finishReason || data.promptFeedback?.blockReason;
        throw new Error(
          blockReason
            ? `Gemini returned no text. Reason: ${blockReason}`
            : 'Gemini returned no text'
        );
      }

      const usage = data.usageMetadata as GeminiUsage | undefined;

      return {
        content: text,
        model: data.modelVersion || this.config.model,
        usage: usage
          ? {
              promptTokens: usage.promptTokenCount,
              completionTokens: usage.candidatesTokenCount,
              totalTokens: usage.totalTokenCount,
              thoughtsTokens: usage.thoughtsTokenCount,
            }
          : undefined,
        raw: JSON.stringify(data),
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async *callStreamApi(
    request: AICompletionRequest
  ): AsyncIterable<AICompletionStreamChunk> {
    const baseUrl = this.config.baseUrl.replace(/\/$/, '');
    const model = encodeURIComponent(this.config.model);
    const url = `${baseUrl}/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(this.config.apiKey)}`;
    const requestedMaxOutputTokens =
      request.maxTokens ?? this.config.maxTokens;
    const modelOutputTokenLimit = await this.getModelOutputTokenLimit();
    const maxOutputTokens = modelOutputTokenLimit
      ? Math.min(requestedMaxOutputTokens, modelOutputTokenLimit)
      : requestedMaxOutputTokens;

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.timeoutMs
    );

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: request.systemPrompt }],
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: request.userPrompt }],
            },
          ],
          generationConfig: {
            temperature: request.temperature ?? this.config.temperature,
            topP: request.topP ?? this.config.topP,
            maxOutputTokens,
            responseMimeType: 'application/json',
            thinkingConfig: this.config.model.includes('gemini-3')
              ? { thinkingLevel: 'minimal' }
              : { thinkingBudget: 0 },
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new Error(
          `Gemini stream API error ${response.status}: ${errorBody.slice(0, 400)}`
        );
      }

      if (!response.body) {
        throw new Error('Gemini stream returned no response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const emitBufferedEvents = function* (
        text: string,
        flush = false
      ): Generator<AICompletionStreamChunk> {
        buffer += text;
        const parts = buffer.split(/\r?\n\r?\n/);
        buffer = flush ? '' : parts.pop() || '';

        for (const eventBlock of parts) {
          const dataLines = eventBlock
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trim())
            .filter(Boolean);

          if (dataLines.length === 0) {
            continue;
          }

          const dataText = dataLines.join('\n');
          if (dataText === '[DONE]') {
            continue;
          }

          let data: any;
          try {
            data = JSON.parse(dataText);
          } catch {
            continue;
          }

          const content = data.candidates?.[0]?.content?.parts
            ?.map((part: { text?: string }) => part.text || '')
            .join('');

          if (content) {
            yield { content };
          }
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        for (const chunk of emitBufferedEvents(
          decoder.decode(value, { stream: true })
        )) {
          yield chunk;
        }
      }

      for (const chunk of emitBufferedEvents(decoder.decode(), true)) {
        yield chunk;
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  private async getModelOutputTokenLimit(): Promise<number | null> {
    if (!this.outputTokenLimitPromise) {
      this.outputTokenLimitPromise = this.fetchModelOutputTokenLimit();
    }

    return this.outputTokenLimitPromise;
  }

  private async fetchModelOutputTokenLimit(): Promise<number | null> {
    const baseUrl = this.config.baseUrl.replace(/\/$/, '');
    const model = encodeURIComponent(this.config.model);
    const url = `${baseUrl}/models/${model}?key=${encodeURIComponent(this.config.apiKey)}`;
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      Math.min(this.config.timeoutMs, 5000)
    );

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        log.warn(
          { status: response.status },
          'Failed to fetch Gemini model metadata'
        );
        return null;
      }

      const data = (await response.json()) as {
        outputTokenLimit?: number;
        output_token_limit?: number;
      };
      const limit = data.outputTokenLimit ?? data.output_token_limit;

      return typeof limit === 'number' && Number.isFinite(limit)
        ? limit
        : null;
    } catch (error) {
      log.warn(
        { error: (error as Error).message },
        'Failed to resolve Gemini model output token limit'
      );
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private shouldRetry(error: Error): boolean {
    if (error.name === 'AbortError') {
      return true;
    }

    return (
      error.message.includes('429') ||
      error.message.includes('500') ||
      error.message.includes('502') ||
      error.message.includes('503') ||
      error.message.includes('504') ||
      error.message.includes('fetch') ||
      error.message.includes('ECONNREFUSED')
    );
  }
}
