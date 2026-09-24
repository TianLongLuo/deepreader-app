import { expect, it, vi } from 'vitest';
vi.mock('@/lib/redis', () => ({ cacheService: {} }));
vi.mock('@/lib/logger', () => ({ createChildLogger: () => ({info:vi.fn(),warn:vi.fn(),error:vi.fn()}) }));
import { readingRequestSchema } from '@/server/reading-assistant/service';
import { lookupDictionary } from '@/server/reading-assistant/dictionary';
import { explanationOptions } from '@/server/ai/explanation-input';
import { buildCoreSystemPrompt, buildCoreUserPrompt, buildCompletenessRepairPrompt, buildRequestSettingsHash } from '@/server/ai/explanation.service';
import { buildExplanationSystemPrompt, buildRepairPrompt } from '@/server/ai/prompt-service';
import type { ParagraphExplanationOutput } from '@/types/explanation';
it('defaults old requests to English and accepts Spanish', () => {
  expect(readingRequestSchema.parse({documentId:'x',mode:'word',text:'niño'}).sourceLanguage).toBe('en');
  expect(readingRequestSchema.parse({documentId:'x',mode:'quiz',text:'¡Hola!',sourceLanguage:'es'}).sourceLanguage).toBe('es');
  expect(explanationOptions.parse({sourceLanguage:'es'}).sourceLanguage).toBe('es');
  expect(explanationOptions.safeParse({sourceLanguage:'fr'}).success).toBe(false);
});
it('uses Spanish grammar consistently in detailed, legacy and repair prompts', () => {
  const core=buildCoreSystemPrompt(true,'es');
  for (const prompt of [core, buildExplanationSystemPrompt({paragraphId:'p',currentParagraph:'Hola',sourceLanguage:'es'}),buildRepairPrompt('{}','bad','es'),buildCompletenessRepairPrompt({paragraphText:'Hola.',currentJson:{} as ParagraphExplanationOutput,issue:'incomplete',bilingualMode:true,sourceLanguage:'es'})]) {
    expect(prompt).toContain('subjunctive'); expect(prompt).toContain('ser/estar'); expect(prompt).toContain('sujeto tácito'); expect(prompt).not.toContain('SV/SVC'); expect(prompt).not.toContain('Grammarly');
  }
  const user=buildCoreUserPrompt({paragraph:'¡Ojalá esté aquí!',bilingualMode:true,sourceLanguage:'es',learningDepth:'grammar'});
  expect(user).toContain('¡Ojalá esté aquí!'); expect(user).toContain('conjugation');
  expect(buildCoreSystemPrompt(false)).toContain('SV/SVC');
});
it('separates detailed explanation caches by source language', () => {
  expect(buildRequestSettingsHash('base',{paragraphId:'p'})).toBe(buildRequestSettingsHash('base',{paragraphId:'p',sourceLanguage:'en'}));
  expect(buildRequestSettingsHash('base',{paragraphId:'p',sourceLanguage:'es'})).not.toBe(buildRequestSettingsHash('base',{paragraphId:'p',sourceLanguage:'en'}));
});
it('never queries English dictionary provider for a Spanish word', async () => {
  const fetchMock=vi.fn();vi.stubGlobal('fetch',fetchMock);
  try { await expect(lookupDictionary('niño',undefined,'es')).rejects.toMatchObject({status:422}); expect(fetchMock).not.toHaveBeenCalled(); } finally {vi.unstubAllGlobals();}
});
