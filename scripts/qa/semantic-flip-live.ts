/** Explicit synthetic-only provider acceptance. Never reads or sends stored books. */
import {semanticFlipSamples} from './semantic-flip-samples';
import {semanticFlipRequestSchema,validateSemanticReplacement} from '../../src/lib/semantic-flip';
async function main(){
 const args=process.argv.slice(2),value=(flag:string)=>args[args.indexOf(flag)+1];
 for(const sample of semanticFlipSamples)semanticFlipRequestSchema.parse(sample.input);
 if(!args.includes('--live-synthetic')){console.log(JSON.stringify({mode:'schema-only',samples:semanticFlipSamples.length,providerCalls:0}));return;}
 if(value('--max-calls')!=='12'||!args.includes('--max-calls')||!args.includes('--user-id')||!value('--user-id'))throw new Error('Explicit --max-calls 12 and --user-id are required');
 const [{prisma},{aiConfigResolver},{streamSemanticFlip}]=await Promise.all([import('../../src/lib/prisma'),import('../../src/server/ai/config-resolver'),import('../../src/server/reading-assistant/semantic-flip')]);
 try{
  const user=await prisma.user.findUnique({where:{id:value('--user-id')},select:{id:true,email:true,workspaceMembers:{select:{workspaceId:true},take:1}}});if(!user?.workspaceMembers[0])throw new Error('Synthetic acceptance account has no workspace');
  const workspaceId=user.workspaceMembers[0].workspaceId,config=await aiConfigResolver.resolve(workspaceId,user.email),stream=config.provider.stream;if(!stream)throw new Error('Configured provider has no native streaming');
  const used=args.includes('--used-calls')?Number(value('--used-calls')):0;
  if(!Number.isInteger(used)||used<0||used>=12)throw new Error('Invalid prior call count');
  const indices=args.includes('--indices')?value('--indices').split(',').map(Number):semanticFlipSamples.map((_,i)=>i);
  if(!indices.length||indices.some(i=>!Number.isInteger(i)||i<0||i>=semanticFlipSamples.length)||new Set(indices).size!==indices.length)throw new Error('Invalid synthetic indices');
  let calls=used;const bounded={...config,cacheEnabled:false,provider:Object.assign(Object.create(config.provider),{async *stream(request:Parameters<typeof stream>[0]){if(calls>=12)throw new Error('Synthetic call budget reached');calls++;for await(const chunk of stream.call(config.provider,request))yield chunk;}})};
  const results=[];for(const index of indices){
   const sample=semanticFlipSamples[index];
   let replacement:string|undefined,error:string|undefined;
   try{for await(const event of streamSemanticFlip({workspaceId,userId:user.id},sample.input,bounded)){if(event.type==='complete')replacement=validateSemanticReplacement({replacement:event.value.replacement});}}catch{error='Synthetic sample did not complete';}
   results.push({index,source:sample.input.sourceLanguage,target:sample.input.targetLanguage,word:sample.input.targetWord,replacement,error,senseCriterion:sample.senseCriterion});if(calls>=12)break;
  }
  console.log(JSON.stringify({mode:'live-synthetic',provider:config.providerKey,model:config.model,calls,newCalls:calls-used,results}));
 }finally{await prisma.$disconnect();}
}
main().catch(()=>{console.error('Synthetic acceptance failed; inspect configuration without sharing credentials.');process.exitCode=1;});
