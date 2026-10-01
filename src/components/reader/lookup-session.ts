export type LookupEvent={source:'dictionary'|'context';status:'ready';data:unknown}|{source:'dictionary'|'context';status:'error';message:string};
export async function startLookup({dictionary,context,signal}:{dictionary:()=>Promise<unknown>;context:()=>Promise<unknown>;signal:AbortSignal},notify:(event:LookupEvent)=>void){
 const settle=async(source:'dictionary'|'context',task:()=>Promise<unknown>)=>{
  try{const data=await task();if(!signal.aborted)notify({source,status:'ready',data});}
  catch(error){if(!signal.aborted)notify({source,status:'error',message:source==='dictionary'?((error as {status?:number})?.status===404?'本站词库暂未收录该词，可尝试原形。':'本站词库暂不可用，请重试。'):(error as {status?:number})?.status===403?'当前账户没有 AI 权限，请联系管理员。':'语境解析暂不可用，请检查 AI 配置后重试。'});}
 };
 await Promise.all([settle('dictionary',dictionary),settle('context',context)]);
}
export function additionalMeanings<T extends {definitions:unknown[]}>(meanings:T[]):T[]{return meanings.map((m,i)=>({...m,definitions:i<2?m.definitions.slice(1):m.definitions})).filter(m=>m.definitions.length>0);}
export function savedLookupPayload(source:{word:string;context:string;sourceLanguage:'en'|'es'},_state:{draft:string;answer:{answer:string}|null;busy:boolean},dictionary?:object){return {...dictionary,...source,aiExplanation:!_state.busy?_state.answer?.answer:undefined,dictionaryAvailable:Boolean(dictionary)};}
