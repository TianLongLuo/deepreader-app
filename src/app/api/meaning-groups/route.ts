import {aiStreamResponse} from '@/server/ai/stream-response';
import {NextResponse} from 'next/server';
import {requireAuth} from '@/lib/auth';
import {prisma} from '@/lib/prisma';
import {aiConfigResolver} from '@/server/ai/config-resolver';
import {generateMeaningGroups,streamMeaningGroups,checkMeaningStreamQuota,meaningGroupRequestSchema,MeaningGroupLimitError} from '@/server/reading-assistant/meaning-groups';
export async function POST(req:Request){
 try{
  const user=await requireAuth();
  if(!user.workspaceId)return NextResponse.json({error:'当前账户没有工作空间'},{status:403});
  const raw=await req.text();if(raw.length>32000)return NextResponse.json({error:'段落过长'},{status:413});
  let body:unknown;try{body=JSON.parse(raw);}catch{return NextResponse.json({error:'Invalid JSON'},{status:400});}
  const parsed=meaningGroupRequestSchema.safeParse(body);
  if(!parsed.success)return NextResponse.json({error:'意群参数不正确或段落过长'},{status:400});
  const document=await prisma.document.findFirst({where:{id:parsed.data.documentId,workspaceId:user.workspaceId,status:{notIn:['DELETED','DELETING']}},select:{id:true}});
  if(!document)return NextResponse.json({error:'Document not found'},{status:404});
  let config;
  try{config=await aiConfigResolver.resolve(user.workspaceId,user.email);}catch{return NextResponse.json({error:'请检查账户 AI 权限和模型配置后重试'},{status:503});}
  if(req.headers.get('Accept')?.includes('application/x-ndjson')){
   checkMeaningStreamQuota({workspaceId:user.workspaceId,userId:user.id},parsed.data,config);
   return aiStreamResponse(req.signal,signal=>streamMeaningGroups({workspaceId:user.workspaceId!,userId:user.id},parsed.data,config,signal));
  }
  const result=await generateMeaningGroups({workspaceId:user.workspaceId,userId:user.id},parsed.data,config,req.signal);
  return NextResponse.json(result,{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){
  if(req.signal.aborted)return new Response(null,{status:499});
  if(error instanceof MeaningGroupLimitError)return NextResponse.json({error:'请求较频繁，请稍后重试'},{status:429,headers:{'Retry-After':String(error.retryAfterSeconds),'Cache-Control':'private, no-store'}});
  if(error instanceof Error&&error.message==='Authentication required')return NextResponse.json({error:'Authentication required'},{status:401});
  return NextResponse.json({error:'本段意群分析未完成，原文保持不变，可稍后重试'},{status:502});
 }
}
