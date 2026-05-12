import { z } from 'zod';

// ============================================================
// Settings DTOs
// ============================================================

export interface AISettingsDTO {
  id: string;
  providerKey: string;
  isEnabled: boolean;
  baseUrl: string;
  maskedApiKeyPreview: string;
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
  isDefault: boolean;
  priority: number;
  lastTestedAt: string | null;
  lastTestStatus: string | null;
  lastTestMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PromptTemplateDTO {
  id: string;
  templateType: string;
  version: string;
  name: string;
  content: string;
  isActive: boolean;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export const updatePromptTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  content: z.string().min(1),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
  version: z.string().min(1).optional(),
});

export const testPromptSchema = z.object({
  templateContent: z.string().min(1),
  sampleParagraph: z.string().min(1),
});

export interface ReaderPreferencesDTO {
  preferredExplanationLanguage: string;
  preferredBilingualMode: boolean;
  preferredGrammarMode: boolean;
  preferredAnnotationLayers: string[];
  readerTheme: string;
}

export const updateReaderPreferencesSchema = z.object({
  preferredExplanationLanguage: z.string().optional(),
  preferredBilingualMode: z.boolean().optional(),
  preferredGrammarMode: z.boolean().optional(),
  preferredAnnotationLayers: z.array(z.string()).optional(),
  readerTheme: z.string().optional(),
});
