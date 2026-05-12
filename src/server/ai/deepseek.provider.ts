import {
  AIProviderInterface,
  AICompletionRequest,
  AICompletionResponse,
  AICompletionStreamChunk,
} from '@/types/ai';
import { createChildLogger } from '@/lib/logger';
import { delay } from '@/lib/utils';
import {
  resolveDeepSeekModel,
  resolveDeepSeekReasoningEffort,
  resolveDeepSeekThinking,
} from './deepseek-config';

const log = createChildLogger('deepseek-provider');

interface DeepSeekConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  timeoutMs: number;
  retryCount: number;
}

/**
 * DeepSeek AI Provider implementation.
 * Uses the OpenAI-compatible API format.
 */
export class DeepSeekProvider implements AIProviderInterface {
  readonly providerKey = 'deepseek';
  private config: DeepSeekConfig;

  constructor(config: DeepSeekConfig) {
    this.config = config;
  }

  async complete(request: AICompletionRequest): Promise<AICompletionResponse> {
    const startTime = Date.now();
    let lastError: Error | null = null;

    const maxAttempts = Math.min(this.config.retryCount + 1, 4);

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
          'DeepSeek completion succeeded'
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
          'DeepSeek completion attempt failed'
        );

        if (attempt < maxAttempts && this.shouldRetry(error as Error)) {
          const backoffMs = Math.min(750 * Math.pow(2, attempt - 1), 2500);
          await delay(backoffMs);
          continue;
        }

        break;
      }
    }

    throw new Error(
      `DeepSeek completion failed after ${maxAttempts} attempts: ${lastError?.message}`
    );
  }

  async testConnection(): Promise<{
    success: boolean;
    message: string;
    latencyMs: number;
  }> {
    const startTime = Date.now();

    try {
      const response = await this.callApi({
        systemPrompt: 'You are a test assistant.',
        userPrompt: 'Reply with exactly: "Connection successful"',
        maxTokens: 20,
        temperature: 0,
      });

      const latencyMs = Date.now() - startTime;

      return {
        success: true,
        message: `Connected to model ${response.model}. Response: "${response.content.substring(0, 50)}"`,
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const message = this.mapError(error as Error);

      return {
        success: false,
        message,
        latencyMs,
      };
    }
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
        model: resolveDeepSeekModel(this.config.model),
        latencyMs: Date.now() - startTime,
        emittedCharacters,
      },
      'DeepSeek stream completed'
    );
  }

  private async callApi(
    request: AICompletionRequest
  ): Promise<Omit<AICompletionResponse, 'latencyMs' | 'provider'>> {
    const url = `${this.config.baseUrl.replace(/\/$/, '')}/chat/completions`;
    const model = resolveDeepSeekModel(this.config.model);

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
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(this.buildPayload(request, false)),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'No response body');
        throw new Error(
          `DeepSeek API error ${response.status}: ${errorBody}`
        );
      }

      const responseText = await response.text();
      const contentType = response.headers.get('content-type') || '';

      if (!contentType.toLowerCase().includes('application/json')) {
        throw new Error(
          `DeepSeek returned a non-JSON response: ${responseText.slice(0, 160)}`
        );
      }

      let data: any;
      try {
        data = JSON.parse(responseText);
      } catch (error) {
        throw new Error(
          `DeepSeek returned invalid JSON: ${(error as Error).message}`
        );
      }

      if (!data.choices || data.choices.length === 0) {
        throw new Error('DeepSeek API returned no choices');
      }

      const content = data.choices[0].message?.content;
      if (!content) {
        throw new Error('DeepSeek API returned empty content');
      }

      return {
        content,
        model: data.model || model,
        usage: data.usage
          ? {
              promptTokens: data.usage.prompt_tokens,
              completionTokens: data.usage.completion_tokens,
              totalTokens: data.usage.total_tokens,
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
    const url = `${this.config.baseUrl.replace(/\/$/, '')}/chat/completions`;
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
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(this.buildPayload(request, true)),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'No response body');
        throw new Error(
          `DeepSeek stream API error ${response.status}: ${errorBody.slice(0, 400)}`
        );
      }

      if (!response.body) {
        throw new Error('DeepSeek stream returned no response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const emitBufferedEvents = function* (
        text: string,
        flush = false
      ): Generator<AICompletionStreamChunk> {
        buffer += text;
        const lines = buffer.split(/\r?\n/);
        buffer = flush ? '' : lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) {
            continue;
          }
          if (!trimmed.startsWith('data:')) {
            continue;
          }

          const dataText = trimmed.slice(5).trim();
          if (!dataText || dataText === '[DONE]') {
            continue;
          }

          let data: any;
          try {
            data = JSON.parse(dataText);
          } catch {
            continue;
          }

          const content = data.choices?.[0]?.delta?.content || '';
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

  private buildPayload(request: AICompletionRequest, stream: boolean) {
    const wantsJson =
      request.systemPrompt.toLowerCase().includes('json') ||
      request.userPrompt.toLowerCase().includes('json');

    const reasoningEffort = resolveDeepSeekReasoningEffort(this.config.model);

    return {
      model: resolveDeepSeekModel(this.config.model),
      messages: [
        { role: 'system', content: request.systemPrompt },
        { role: 'user', content: request.userPrompt },
      ],
      temperature: request.temperature ?? this.config.temperature,
      max_tokens: request.maxTokens ?? this.config.maxTokens,
      top_p: request.topP ?? this.config.topP,
      stream,
      thinking: resolveDeepSeekThinking(this.config.model),
      ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
      ...(wantsJson ? { response_format: { type: 'json_object' } } : {}),
    };
  }

  private mapError(error: Error): string {
    if (error.name === 'AbortError') {
      return `Connection timed out after ${this.config.timeoutMs}ms`;
    }
    if (error.message.includes('401')) {
      return 'Authentication failed: Invalid API key';
    }
    if (error.message.includes('403')) {
      return 'Access denied: Check API key permissions';
    }
    if (error.message.includes('404')) {
      return 'Model not found: Check model name and base URL';
    }
    if (error.message.includes('429')) {
      return 'Rate limited: Too many requests';
    }
    if (error.message.includes('500') || error.message.includes('502') || error.message.includes('503')) {
      return 'Server error: DeepSeek API is temporarily unavailable';
    }
    if (
      error.message.includes('non-JSON response') ||
      error.message.includes('invalid JSON') ||
      error.message.includes('empty content')
    ) {
      return 'DeepSeek returned an invalid upstream response. Please retry in a moment.';
    }
    if (error.message.includes('fetch') || error.message.includes('ECONNREFUSED')) {
      return 'Connection failed: Check base URL and network connectivity';
    }
    return `Connection error: ${error.message}`;
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
      error.message.includes('empty content') ||
      error.message.includes('fetch') ||
      error.message.includes('ECONNREFUSED')
    );
  }
}
