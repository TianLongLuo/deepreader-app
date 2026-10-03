import {z} from 'zod';

/** All offsets address unchanged source UTF-16, never rendered replacements. */
export type SemanticFlipInput={documentId:string;sourceLanguage:'en'|'es';targetLanguage:'en'|'zh'|'es';sourceText:string;start:number;end:number;targetWord:string;occurrence:string;previousText?:string;nextText?:string};
export type SemanticFlipResult={replacement:string;provider:string;model:string};
const wordPattern=/[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:['’\-][\p{L}\p{M}\p{N}]+)*/gu;
const codePointBoundary=(text:string,offset:number)=>!(offset>0&&offset<text.length&&/[\uD800-\uDBFF]/.test(text[offset-1])&&/[\uDC00-\uDFFF]/.test(text[offset]));
export const semanticFlipRequestSchema:z.ZodType<SemanticFlipInput>=z.object({
 documentId:z.string().min(1).max(200),sourceLanguage:z.enum(['en','es']),targetLanguage:z.enum(['en','zh','es']),
 sourceText:z.string().min(1).max(6000),start:z.number().int().nonnegative(),end:z.number().int().positive(),
 targetWord:z.string().min(1).max(120),occurrence:z.string().min(1).max(2000),previousText:z.string().max(1500).optional(),nextText:z.string().max(1500).optional(),
}).strict().superRefine((value,ctx)=>{
 const {sourceText,start,end,targetWord}=value;
 const exact=start<end&&end<=sourceText.length&&sourceText.slice(start,end)===targetWord&&codePointBoundary(sourceText,start)&&codePointBoundary(sourceText,end);
 const whole=exact&&Array.from(sourceText.matchAll(wordPattern)).some(match=>match.index===start&&match.index+match[0].length===end);
 if(!whole)ctx.addIssue({code:'custom',message:'Expected one exact original word',path:['targetWord']});
});
const replacementSchema=z.object({replacement:z.string()}).strict();
/** Format verification only; contextual correctness still needs semantic acceptance. */
export function validateSemanticReplacement(value:unknown):string{
 const raw=replacementSchema.parse(value).replacement;
 if(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(raw))throw new Error('Expected a single line');
 const replacement=raw.trim();
 if(!replacement||replacement.length>120||replacement.split(/\s+/u).length>6||/<\/?[A-Za-z!][^>]*>|[`*_]|\[[^\]]*\]\s*\(|^\s*#{1,6}\s/u.test(replacement))throw new Error('Expected a short plain expression');
 return replacement;
}
