import {NextResponse} from 'next/server';
import {z} from 'zod';
import {prisma} from '@/lib/prisma';
import {createPracticeService} from '@/server/practice/service';
import {learningUser,learningBody,learningFailure,privateHeaders} from '@/server/vocabulary/http';
import {aiStreamResponse} from '@/server/ai/stream-response';
export const runtime='nodejs';export const maxDuration=240;
const service=createPracticeService(prisma),schema=z.object({action:z.enum(['retry','read'])}).strict();type Context={params:Promise<{id:string}>};
const key=async(context:Context)=>z.string().min(1).max(200).parse((await context.params).id);
export async function GET(req:Request,context:Context){try{return NextResponse.json(await service.getPractice(await learningUser(req),await key(context)),{headers:privateHeaders});}catch(error){return learningFailure(error);}}
export async function POST(req:Request,context:Context){try{const scope=await learningUser(req,true),id=await key(context),data=schema.parse(await learningBody(req));await service.ownedTask(scope,id);return data.action==='retry'?aiStreamResponse(req.signal,signal=>service.streamPractice(scope,{},signal,id)):NextResponse.json(await service.markRead(scope,id),{headers:privateHeaders});}catch(error){return learningFailure(error);}}
