import type {PrismaClient} from '@prisma/client';
import type {LearningScope} from '@/server/vocabulary/types';
import {aiConfigResolver} from '@/server/ai/config-resolver';
import {AIStreamError} from '@/lib/ai-stream';
import {awaitWithSignal} from '@/server/reading-assistant/cancellation';
import {readPartialString} from '@/lib/partial-json-string';
export async function resolvePracticeModel(db:PrismaClient,scope:LearningScope){const user=await db.user.findUnique({where:{id:scope.userId},select:{email:true}});if(!user)throw new AIStreamError('UNAVAILABLE','');try{const config=await aiConfigResolver.resolve(scope.workspaceId,user.email);if(!config.provider.stream)throw new AIStreamError('STREAM_UNSUPPORTED','');return config;}catch(error){if(error instanceof AIStreamError)throw error;throw new AIStreamError('UNAVAILABLE','');}}
/** Real upstream chunks only. JSON evidence/private keys never reach a public delta. */
export async function* practiceJSON(config:Awaited<ReturnType<typeof resolvePracticeModel>>,systemPrompt:string,payload:unknown,signal:AbortSignal,field?:string):AsyncGenerator<{delta:string}|{value:unknown;displayed:string}>{
 let raw='',displayed='';const iterator=config.provider.stream!({systemPrompt,userPrompt:JSON.stringify(payload),temperature:0.2,maxTokens:Math.min(config.maxTokens,4096),signal})[Symbol.asyncIterator]();
 try{for(;;){const next=await awaitWithSignal(iterator.next(),signal);if(next.done)break;signal.throwIfAborted();raw+=next.value.content;if(raw.length>64000)throw new AIStreamError('TOO_LARGE','');if(field){const draft=readPartialString(raw,field);if(!draft.startsWith(displayed))throw new AIStreamError('INVALID_OUTPUT','');if(draft.length>displayed.length){const delta=draft.slice(displayed.length);displayed=draft;yield {delta};}}}
  signal.throwIfAborted();let value;try{value=JSON.parse(raw.replace(/^\s*```(?:json)?\s*/,'').replace(/\s*```\s*$/,''));}catch{throw new AIStreamError('INVALID_OUTPUT','');}
  if(field&&(value as Record<string,unknown>)[field]!==displayed)throw new AIStreamError('INVALID_OUTPUT','');yield {value,displayed};
 }finally{void iterator.return?.().catch(()=>{});}
}
