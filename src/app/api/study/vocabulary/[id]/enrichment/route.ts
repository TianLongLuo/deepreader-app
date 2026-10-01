import {NextResponse} from 'next/server';
import {z} from 'zod';
import {prisma} from '@/lib/prisma';
import {aiStreamResponse} from '@/server/ai/stream-response';
import {createEnrichmentJobs} from '@/server/vocabulary/jobs';
import {learningUser,learningBody,learningFailure,privateHeaders} from '@/server/vocabulary/http';
export const runtime='nodejs';
export const maxDuration=180;
const jobs=createEnrichmentJobs(prisma),id=z.string().min(1).max(200);type Context={params:Promise<{id:string}>};
export async function GET(req:Request,context:Context){try{const scope=await learningUser(req),key=id.parse((await context.params).id);await jobs.status(scope,key);return req.headers.get('accept')?.includes('application/x-ndjson')?aiStreamResponse(req.signal,signal=>jobs.subscribe(scope,key,signal)):NextResponse.json(await jobs.status(scope,key),{headers:privateHeaders});}catch(error){return learningFailure(error);}}
export async function POST(req:Request,context:Context){try{const scope=await learningUser(req,true),key=id.parse((await context.params).id);z.object({}).strict().parse(await learningBody(req));await jobs.retry(scope,key);return NextResponse.json(await jobs.status(scope,key),{headers:privateHeaders});}catch(error){return learningFailure(error);}}
