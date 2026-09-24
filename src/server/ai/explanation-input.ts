import { z } from "zod";
export const explanationOptions = z.object({
  forceRegenerate: z.boolean().default(false),
  bilingualMode: z.boolean().default(false),
  grammarMode: z.boolean().default(true),
  explanationLanguage: z.string().max(40).default("English"),
  learningDepth: z.enum(["quick", "structure", "grammar"]).default("structure"),
  previousText: z.string().max(5000).optional(),
  nextText: z.string().max(5000).optional(),
  stream: z.boolean().default(false),
});
export const textExplanationInput = explanationOptions.extend({
  documentId: z.string().min(1).max(200),
  text: z.string().trim().min(1).max(20000),
});
