import {NextResponse} from 'next/server';
import {ZodError} from 'zod';
import {requireAuth} from '@/lib/auth';
import {assertSameOrigin,AuthRequestError} from '@/lib/auth-guard';
import {VocabularyError} from './service';
export const privateHeaders={'Cache-Control':'private, no-store'};
const counters=new Map<string,{count:number;reset:number}>();
export async function learningUser(req:Request,write=false){
 const user=await requireAuth();if(!user.workspaceId)throw new VocabularyError('没有工作空间',403);
 if(write)assertSameOrigin(req);
 const now=Date.now(),key=user.id+':'+user.workspaceId;
 for(const [id,limit] of counters)if(limit.reset<=now)counters.delete(id);
 if(counters.size>=2048&&!counters.has(key))throw new VocabularyError('请求较频繁，请稍后再试',429);
 let counter=counters.get(key);if(!counter){counter={count:0,reset:now+60000};counters.set(key,counter);}if(++counter.count>120)throw new VocabularyError('请求较频繁，请稍后再试',429);
 return {userId:user.id,workspaceId:user.workspaceId};
}
export async function learningBody(req:Request){const raw=await req.text();if(raw.length>16000)throw new VocabularyError('请求过大',413);try{return JSON.parse(raw);}catch{throw new VocabularyError('JSON 格式不正确',400);}}
export function learningFailure(error:unknown){
 const status=error instanceof VocabularyError||error instanceof AuthRequestError?error.status:error instanceof ZodError?400:error instanceof Error&&error.message==='Authentication required'?401:500;
 return NextResponse.json({error:status===500?'学习数据处理失败，请重试':error instanceof ZodError?'学习参数不正确':error instanceof Error?error.message:'请求失败'},{status,headers:{...privateHeaders,...(status===429?{'Retry-After':'60'}:{})}});
}
