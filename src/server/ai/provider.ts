import { AIProviderConfig, AIProviderResponse } from '@/types/ai';

export interface AIProvider {
  generateStructuredExplanation(args: {
    config: AIProviderConfig;
    systemPrompt: string;
    userPrompt: string;
  }): Promise<AIProviderResponse>;
}
