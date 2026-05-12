export type AIProviderConfig = {
  provider: "deepseek" | string;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  topP?: number;
  timeoutMs: number;
  retryCount: number;
  saveRawPrompt?: boolean;
  saveRawResponse?: boolean;
};

export interface AIProviderResponse {
  rawText: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  model?: string;
  provider: string;
}

export interface AIProvider {
  generateStructuredExplanation(args: {
    config: AIProviderConfig;
    systemPrompt: string;
    userPrompt: string;
  }): Promise<AIProviderResponse>;
}

// Custom Error classes
export class AIProviderError extends Error {
  public code: string;
  public details?: unknown;
  constructor(message: string, code: string, details?: unknown) {
    super(message);
    this.name = 'AIProviderError';
    this.code = code;
    this.details = details;
  }
}

export class AIResponseParseError extends Error {
  public details?: unknown;
  constructor(message: string, details?: unknown) {
    super(message);
    this.name = 'AIResponseParseError';
    this.details = details;
  }
}

export class AIResponseValidationError extends Error {
  public details?: unknown;
  constructor(message: string, details?: unknown) {
    super(message);
    this.name = 'AIResponseValidationError';
    this.details = details;
  }
}

export class AIRepairFailedError extends Error {
  public details?: unknown;
  constructor(message: string, details?: unknown) {
    super(message);
    this.name = 'AIRepairFailedError';
    this.details = details;
  }
}

export type AIProviderSettings = {
  providerKey: string;
  isEnabled: boolean;
  baseUrl: string;
  apiKey?: string;
  model: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  timeoutMs: number;
  retryCount: number;
  streamingEnabled: boolean;
  saveRawPrompt: boolean;
  saveRawResponse: boolean;
  saveRequestInput: boolean;
  cacheEnabled: boolean;
  isDefault?: boolean;
  priority?: number;
};

import { z } from 'zod';
export const aiProviderSettingsSchema = z.any();

export type AICompletionRequest = {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
};
export type AICompletionResponse = {
  content: string;
  metadata?: any;
  usage?: any;
  latencyMs?: number;
  model?: string;
  provider?: string;
  raw?: any;
};
export type AICompletionStreamChunk = {
  content: string;
};
export interface AIProviderInterface {
  complete(request: AICompletionRequest): Promise<AICompletionResponse>;
  stream?(request: AICompletionRequest): AsyncIterable<AICompletionStreamChunk>;
}
