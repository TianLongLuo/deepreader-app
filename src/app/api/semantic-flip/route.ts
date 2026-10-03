import {requireAuth} from '@/lib/auth';
import {prisma} from '@/lib/prisma';
import {semanticFlipRequestSchema} from '@/lib/semantic-flip';
import {aiConfigResolver} from '@/server/ai/config-resolver';
import {aiStreamResponse} from '@/server/ai/stream-response';
import {checkSemanticFlipQuota,streamSemanticFlip} from '@/server/reading-assistant/semantic-flip';
import {ReadingAILimitError} from '@/server/reading-assistant/reading-ai-budget';
const MAX_BODY=65536;
class BodyTooLarge extends Error{}
const json=(error:string,status:number,headers:Record<string,string>={})=>Response.json({error},{status,headers:{'Cache-Control':'private, no-store',...headers}});
async function boundedBody(req:Request){
 const length=Number(req.headers.get('Content-Length'));
 if(Number.isFinite(length)&&length>MAX_BODY){await req.body?.cancel();throw new BodyTooLarge();}
 if(!req.body)return '';
 const reader=req.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0,raw='';
 try{while(true){req.signal.throwIfAborted();const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>MAX_BODY){await reader.cancel();throw new BodyTooLarge();}raw+=decoder.decode(value,{stream:true});}return raw+decoder.decode();}
 finally{reader.releaseLock();}
}
export async function POST(req:Request):Promise<Response>{
 try{
  const user=await requireAuth();if(!user.workspaceId)return json('当前账户没有工作空间',403);
  let body:unknown;try{body=JSON.parse(await boundedBody(req));}catch(error){if(error instanceof BodyTooLarge)throw error;if(req.signal.aborted)throw error;return json('翻牌参数不正确',400);}
  const parsed=semanticFlipRequestSchema.safeParse(body);if(!parsed.success)return json('翻牌参数不正确',400);
  const document=await prisma.document.findFirst({where:{id:parsed.data.documentId,workspaceId:user.workspaceId,status:{notIn:['DELETED','DELETING']}},select:{id:true}});
  if(!document)return json('Document not found',404);
  let config;try{config=await aiConfigResolver.resolve(user.workspaceId,user.email);}catch{return json('请检查账户 AI 权限和模型配置后重试',503);}
  const scope={workspaceId:user.workspaceId,userId:user.id};checkSemanticFlipQuota(scope,parsed.data,config);
  return aiStreamResponse(req.signal,signal=>streamSemanticFlip(scope,parsed.data,config,signal));
 }catch(error){
  if(req.signal.aborted)return new Response(null,{status:499});
  if(error instanceof BodyTooLarge)return json('翻牌参数过长',413);
  if(error instanceof ReadingAILimitError)return json('请求较频繁，请稍后重试',429,{'Retry-After':String(error.retryAfterSeconds)});
  if(error instanceof Error&&error.message==='Authentication required')return json('Authentication required',401);
  return json('本次翻牌未完成，原文保持不变，请稍后重试',502);
 }
}
