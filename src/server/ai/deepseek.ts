import { AIProviderConfig, AIProviderResponse, AIProviderError } from '@/types/ai';
import { AIProvider } from './provider';
import {
  resolveDeepSeekModel,
  resolveDeepSeekReasoningEffort,
  resolveDeepSeekThinking,
} from './deepseek-config';

interface DeepSeekChatCompletionResponse {
  choices: Array<{
    message: {
      content: string;
      role: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  model: string;
}

export class DeepSeekProvider implements AIProvider {
  
  private sanitizeConfig(config: AIProviderConfig): Partial<AIProviderConfig> {
    const { apiKey, ...safeConfig } = config;
    return { ...safeConfig, apiKey: '***REDACTED***' };
  }

  async generateStructuredExplanation(args: {
    config: AIProviderConfig;
    systemPrompt: string;
    userPrompt: string;
  }): Promise<AIProviderResponse> {
    const { config, systemPrompt, userPrompt } = args;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      const url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
      const reasoningEffort = resolveDeepSeekReasoningEffort(config.model);
      
      const payload = {
        model: resolveDeepSeekModel(config.model),
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: config.temperature,
        max_tokens: config.maxTokens,
        top_p: config.topP,
        stream: false,
        thinking: resolveDeepSeekThinking(config.model),
        ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
        response_format: { type: 'json_object' }
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorBody = {};
        try {
          errorBody = await response.json();
        } catch {
          // ignore parsing error if it's not JSON
        }
        throw new AIProviderError(`DeepSeek API Error: ${response.status} ${response.statusText}`, 'HTTP_ERROR', {
          status: response.status,
          response: errorBody,
        });
      }

      const data = await response.json() as DeepSeekChatCompletionResponse;
      
      const content = data.choices[0]?.message?.content;
      if (!content) {
        throw new AIProviderError('No content found in DeepSeek response', 'EMPTY_RESPONSE');
      }

      return {
        rawText: content,
        usage: data.usage ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens
        } : undefined,
        model: data.model || config.model,
        provider: 'deepseek'
      };

    } catch (error: any) {
      clearTimeout(timeoutId);
      
      if (error instanceof AIProviderError) {
        throw error;
      }
      
      if (error.name === 'AbortError') {
        throw new AIProviderError(`Request to DeepSeek timed out after ${config.timeoutMs}ms`, 'TIMEOUT_ERROR', {
          config: this.sanitizeConfig(config)
        });
      }

      throw new AIProviderError(`DeepSeek request failed: ${(error as Error).message}`, 'NETWORK_ERROR', {
        cause: error.cause,
        config: this.sanitizeConfig(config)
      });
    }
  }
}
