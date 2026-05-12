import { z } from 'zod';

export const SentenceRoleSchema = z.object({
  text: z.string(),
  role: z.enum(['subject', 'verb', 'object', 'modifier', 'clause', 'phrase', 'other']),
  start_offset: z.number().int(),
  end_offset: z.number().int(),
  label: z.string(),
  explanation: z.string(),
});

export const WhoDidWhatSchema = z.object({
  actor: z.string(),
  action: z.string(),
  target: z.string(),
  actor_modifier: z.string().optional(),
  actor_core: z.string().optional(),
  action_modifier: z.string().optional(),
  action_core: z.string().optional(),
  target_modifier: z.string().optional(),
  target_core: z.string().optional(),
  extra: z.string().optional(),
});

export const VocabularyNoteSchema = z.object({
  term: z.string(),
  meaning: z.string(),
  translation: z.string().optional(),
  usage_note: z.string().optional(),
});

export const GrammarNoteSchema = z.object({
  pattern: z.string(),
  explanation: z.string(),
});

export const LogicFlowStepSchema = z.object({
  step: z.number().int(),
  text: z.string(),
  relation: z.string(),
  explanation: z.string(),
});

export const ClauseMapItemSchema = z.object({
  clause_text: z.string(),
  clause_type: z.string().optional(),
  chinese_type: z.string().optional(),
  connector: z.string().optional(),
  full_sentence: z.string().optional(),
  main_clause: z.string().optional(),
  modifies: z.string().optional(),
  role_in_sentence: z.string().optional(),
});

export const ReferenceMapItemSchema = z.object({
  expression: z.string(),
  refers_to: z.string(),
  evidence: z.string().optional(),
});

export const SentenceLearningFocusSchema = z.object({
  plain_takeaway: z.string().optional(),
  why_it_is_hard: z.array(z.string()).optional(),
  reading_tip: z.string().optional(),
});

export const SentenceBreakdownSchema = z.object({
  sentence_index: z.number().int(),
  sentence_text: z.string(),
  sentence_pattern: z.string().optional(),
  clause_type: z.string().optional(),
  clause_role: z.string().optional(),
  subject_modifier: z.string().optional(),
  subject_core: z.string().optional(),
  verb_modifier: z.string().optional(),
  verb_core: z.string().optional(),
  object_modifier: z.string().optional(),
  object_core: z.string().optional(),
  connector: z.string().optional(),
  logic: z.string().optional(),
  logic_breakdown: z.string().optional(),
  clause_map: z.array(ClauseMapItemSchema).optional(),
  reference_map: z.array(ReferenceMapItemSchema).optional(),
  learning_focus: SentenceLearningFocusSchema.optional(),
  explanation: z.string(),
});

export const ParagraphExplanationSchema = z.object({
  paragraph_summary: z.string(),
  plain_meaning: z.string(),
  sentence_roles: z.array(SentenceRoleSchema),
  who_did_what: z.array(WhoDidWhatSchema),
  vocabulary_notes: z.array(VocabularyNoteSchema),
  grammar_notes: z.array(GrammarNoteSchema),
  logic_flow: z.array(LogicFlowStepSchema).optional(),
  sentence_breakdown: z.array(SentenceBreakdownSchema).optional(),
  tone_or_subtext: z.string().optional(),
  translation: z.string().optional(),
  reading_tip: z.string().optional(),
});

export type SentenceRole = z.infer<typeof SentenceRoleSchema>;
export type WhoDidWhat = z.infer<typeof WhoDidWhatSchema>;
export type VocabularyNote = z.infer<typeof VocabularyNoteSchema>;
export type GrammarNote = z.infer<typeof GrammarNoteSchema>;
export type LogicFlowStep = z.infer<typeof LogicFlowStepSchema>;
export type ClauseMapItem = z.infer<typeof ClauseMapItemSchema>;
export type ReferenceMapItem = z.infer<typeof ReferenceMapItemSchema>;
export type SentenceLearningFocus = z.infer<typeof SentenceLearningFocusSchema>;
export type SentenceBreakdown = z.infer<typeof SentenceBreakdownSchema>;
export type ParagraphExplanation = z.infer<typeof ParagraphExplanationSchema>;

export type ParagraphExplanationInput = {
  paragraphId: string;
  currentParagraph: string;
  previousParagraph?: string | null;
  nextParagraph?: string | null;
  explanationLanguage?: string;
  bilingual?: boolean;
  includeGrammar?: boolean;
  includeVocabulary?: boolean;
};

export type ParagraphExplanationServiceResult = {
  explanation: ParagraphExplanation;
  metadata: {
    provider: string;
    model?: string;
    repaired: boolean;
    usage?: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
    };
    rawText?: string;
  };
};

export type ParagraphExplanationOutput = ParagraphExplanation;

export type ExplanationRequest = {
  paragraphId: string;
  forceRegenerate?: boolean;
  bilingualMode?: boolean;
  grammarMode?: boolean;
  explanationLanguage?: string;
  userPreferences?: Record<string, any>;
};

export type ExplanationResponse = {
  id: string;
  paragraphId: string;
  provider: string;
  model: string;
  promptVersion: string;
  status: string;
  output: ParagraphExplanationOutput | null;
  error?: string;
  cached: boolean;
  createdAt: string;
};
