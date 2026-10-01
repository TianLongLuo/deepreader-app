import {NextResponse} from 'next/server';
import {z} from 'zod';
import {prisma} from '@/lib/prisma';
import {createPracticeFeedback,feedbackInputSchema} from '@/server/practice/feedback';
import {learningUser,learningBody,learningFailure,privateHeaders} from '@/server/vocabulary/http';
import {aiStreamResponse} from '@/server/ai/stream-response';
export const runtime='nodejs';export const maxDuration=120;
const service=createPracticeFeedback(prisma);type Context={params:Promise<{id:string}>};
const key=async(context:Context)=>z.string().min(1).max(200).parse((await context.params).id);
export async function POST(req:Request,context:Context){try{const scope=await learningUser(req,true),id=await key(context),data=feedbackInputSchema.parse(await learningBody(req));return aiStreamResponse(req.signal,signal=>service.streamFeedback(scope,id,data,signal));}catch(error){return learningFailure(error);}}
export async function PATCH(req:Request,context:Context){try{const scope=await learningUser(req,true),id=await key(context),data=z.object({responseId:z.string().min(1).max(200),action:z.literal('dispute')}).strict().parse(await learningBody(req));return NextResponse.json(await service.dispute(scope,id,data.responseId),{headers:privateHeaders});}catch(error){return learningFailure(error);}}

export async function GET(req:Request,context:Context){try{return NextResponse.json(await service.latestResponse(await learningUser(req),await key(context)),{headers:privateHeaders});}catch(error){return learningFailure(error);}}
