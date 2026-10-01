import {NextResponse} from 'next/server';
import {z} from 'zod';
import {prisma} from '@/lib/prisma';
import {createPracticeFeedback} from '@/server/practice/feedback';
import {learningUser,learningBody,learningFailure,privateHeaders} from '@/server/vocabulary/http';
const service=createPracticeFeedback(prisma);type Context={params:Promise<{id:string}>};
export async function POST(req:Request,context:Context){try{const scope=await learningUser(req,true),id=z.string().min(1).max(200).parse((await context.params).id);z.object({}).strict().parse(await learningBody(req));return NextResponse.json(await service.hint(scope,id),{headers:privateHeaders});}catch(error){return learningFailure(error);}}
