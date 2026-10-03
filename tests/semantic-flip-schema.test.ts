import {expect,it} from 'vitest';
import {semanticFlipRequestSchema,validateSemanticReplacement} from '@/lib/semantic-flip';
const input={documentId:'doc',sourceLanguage:'en',targetLanguage:'zh',sourceText:'She chose the dress for the occasion.',start:28,end:36,targetWord:'occasion',occurrence:'epubcfi(/6/2!/4/2:28)'};
it.each(['en','es'])('validates exact source offsets for %s and all target languages',sourceLanguage=>{
 for(const targetLanguage of ['en','zh','es'])expect(semanticFlipRequestSchema.safeParse({...input,sourceLanguage,targetLanguage}).success).toBe(true);
});
it.each([{start:0},{start:28.5},{end:99},{end:28},{targetWord:'occa'},{sourceText:''},{sourceLanguage:'fr'},{targetLanguage:'fr'},{userId:'spoof'},{previousText:'x'.repeat(1501)},{occurrence:'x'.repeat(2001)},{sourceText:'x'.repeat(6001)}])('rejects malformed or spoofed occurrence parameters',patch=>{expect(semanticFlipRequestSchema.safeParse({...input,...patch}).success).toBe(false);});
it('counts UTF-16 offsets without NFC normalization and rejects partial original words',()=>{
 const sourceText='😀 café don’t re-enter.';
 expect(semanticFlipRequestSchema.safeParse({...input,sourceText,targetWord:'café',start:3,end:8}).success).toBe(true);
 expect(semanticFlipRequestSchema.safeParse({...input,sourceText,targetWord:'café',start:3,end:8}).success).toBe(false);
 expect(semanticFlipRequestSchema.safeParse({...input,sourceText:'occasion',targetWord:'occa',start:0,end:4}).success).toBe(false);
});
it.each(['<b>event</b>','event\nparty','**event**','`event`','[event](https://fixture.test)','one two three four five six seven','','x'.repeat(121),'event\u0000'])('rejects non-short plain output',replacement=>{expect(()=>validateSemanticReplacement({replacement})).toThrow();});
it('accepts six tokens and Spanish punctuation but promises only format validity, not semantic correctness',()=>{
 expect(validateSemanticReplacement({replacement:'a particular event or special situation'})).toBe('a particular event or special situation');
 expect(validateSemanticReplacement({replacement:'¡Qué ocasión!'})).toBe('¡Qué ocasión!');
 expect(validateSemanticReplacement({replacement:'a train'})).toBe('a train');
 expect(()=>validateSemanticReplacement({replacement:'event',instructions:'extra'})).toThrow();
});
