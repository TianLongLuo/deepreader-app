import {z} from 'zod';
import {AIStreamError} from '@/lib/ai-stream';
import type {PracticeTarget} from './types';
const question=z.object({id:z.string().min(1).max(80),question:z.string().min(5).max(1000),answer:z.string().min(1).max(2000),quote:z.string().min(3).max(2000)}).strict();
export const practiceWireSchema=z.object({passage:z.string().max(16000),questions:z.array(question).max(2),applicationPrompt:z.string().min(10).max(2000)}).strict();
export type PracticeWire=z.infer<typeof practiceWireSchema>;
const escape=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function containsForm(text:string,forms:string[]){const normalized=text.normalize('NFC');return forms.some(form=>new RegExp('(?<![\\p{L}\\p{M}])'+escape(form.normalize('NFC'))+'(?![\\p{L}\\p{M}])','iu').test(normalized));}
export function validatePractice(input:{mode:string;wordCount?:number;targets:PracticeTarget[];value:unknown}):PracticeWire{
 try{const value=practiceWireSchema.parse(input.value);
  if(input.mode==='application'){if(value.passage||value.questions.length)throw new Error();}
  else{
   const words=value.passage.match(/[\p{L}\p{M}\p{N}]+(?:['’\-][\p{L}\p{M}\p{N}]+)*/gu)?.length??0,requested=input.wordCount??250;
   if(words<requested*0.7||words>requested*1.3||value.questions.length!==2||new Set(value.questions.map(q=>q.id)).size!==2)throw new Error();
   if(value.questions.some(q=>!value.passage.includes(q.quote)))throw new Error();
   // Target coverage/unknown inflections are independently checked with grounded surfaces below.
  }return value;
 }catch{throw new AIStreamError('INVALID_OUTPUT','');}
}
export const semanticSchema=z.object({valid:z.boolean(),targets:z.array(z.object({senseId:z.string(),correct:z.boolean(),surface:z.string().trim().min(1).max(200).nullable().optional()}).strict()).max(12),questionsGrounded:z.boolean(),applicationAppropriate:z.boolean()}).strict();
export function validateSemantics(raw:unknown,targets:PracticeTarget[],exercise?:PracticeWire,mode?:string){try{const data=semanticSchema.parse(raw);if(!data.valid||!data.questionsGrounded||!data.applicationAppropriate||data.targets.length!==targets.length||new Set(data.targets.map(t=>t.senseId)).size!==targets.length||targets.some(t=>!data.targets.some(v=>v.senseId===t.senseId&&v.correct)))throw new Error();
 if(mode==='reading'){
  if(!exercise)throw new Error();
  for(const target of targets){const judgment=data.targets.find(t=>t.senseId===target.senseId)!;
   // Known forms remain a fast path. Unknown forms require the independent model's
   // positive morphological/sense judgment AND an exact grounded surface, not a guess.
   if(judgment.surface&&!containsForm(exercise.passage,[judgment.surface]))throw new Error();
   if(!containsForm(exercise.passage,target.forms)&&(!judgment.surface||!containsForm(exercise.passage,[judgment.surface])))throw new Error();
  }
 }return data;}catch{throw new AIStreamError('INVALID_OUTPUT','');}}
