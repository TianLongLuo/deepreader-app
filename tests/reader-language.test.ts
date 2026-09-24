import { describe, expect, it, vi, afterEach } from 'vitest';
import { sentencePatternHint, speakInBrowser, validSourceLanguage } from '@/components/reader/language-tools';
afterEach(()=>vi.unstubAllGlobals());
describe('language-aware reader controls',()=>{
 it('accepts only supported source languages from navigation',()=>{
  expect(validSourceLanguage('es')).toBe('es');expect(validSourceLanguage('en')).toBe('en');expect(validSourceLanguage('fr')).toBeNull();expect(validSourceLanguage(null)).toBeNull();
 });
 it('uses Spanish grammar concepts instead of English sentence templates',()=>{
  expect(sentencePatternHint('es')).toContain('tácito');expect(sentencePatternHint('es')).not.toContain('SVOC');expect(sentencePatternHint('en')).toContain('SVOC');
 });
 it('selects a Spanish voice and language instead of default English voice',async()=>{
  const voice={lang:'es-MX'};
  const speak=vi.fn(u=>u.onend());
  vi.stubGlobal('window',{speechSynthesis:{getVoices:()=>[{lang:'en-US'},voice],cancel:vi.fn(),speak}});
  vi.stubGlobal('SpeechSynthesisUtterance',class {constructor(public text:string){} });
  await speakInBrowser('El niño lee.','es');
  expect(speak.mock.calls[0][0]).toMatchObject({text:'El niño lee.',lang:'es-MX',voice});
 });
 it('reports missing Spanish voice rather than reading with English voice',async()=>{
  const speak=vi.fn();vi.stubGlobal('window',{speechSynthesis:{getVoices:()=>[{lang:'en-US'}],speak}});
  await expect(speakInBrowser('corazón','es')).rejects.toThrow('西班牙语语音');expect(speak).not.toHaveBeenCalled();
 });
});
