import {z} from 'zod';
const shared={sourceLanguage:z.enum(['en','es']),definitionLanguage:z.enum(['en','zh']).default('zh'),level:z.enum(['A2','B1','B2','C1']).default('B2'),senseIds:z.array(z.string().min(1).max(200)).min(1).max(12).optional()};
export const practiceInputSchema=z.discriminatedUnion('mode',[
 z.object({...shared,mode:z.literal('reading'),targetCount:z.number().int().min(3).max(12).default(6),wordCount:z.number().int().min(100).max(500).default(250)}).strict(),
 z.object({...shared,mode:z.literal('application'),targetCount:z.number().int().min(2).max(3).default(3)}).strict(),
]);
export type PracticeInput=z.infer<typeof practiceInputSchema>;
export type PracticeTarget={senseId:string;lemma:string;meaning:string;domain:string|null;forms:string[];revision:number};
export type PracticeDeferred={senseId:string;lemma:string;reason:string};
export type PracticePublic={id:string;mode:'reading'|'application';sourceLanguage:'en'|'es';definitionLanguage:'en'|'zh';level:string;targets:Array<{senseId:string;lemma:string}>;applicationTargetIds:string[];deferred:PracticeDeferred[];passage:string;questions:Array<{id:string;question:string}>;applicationPrompt:string;status:string;stage:'generating'|'validating'|'repairing'|'ready'|'failed';revised:boolean;usedHint:boolean};
