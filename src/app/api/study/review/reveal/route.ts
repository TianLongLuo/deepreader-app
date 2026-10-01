import {NextResponse} from 'next/server';
import {z} from 'zod';
import {reviewService} from '@/server/review/service';
import {learningUser,learningBody,learningFailure,privateHeaders} from '@/server/vocabulary/http';
const input=z.object({sessionId:z.string().min(1).max(200)}).strict();
export async function POST(req:Request){try{const scope=await learningUser(req,true),data=input.parse(await learningBody(req));return NextResponse.json(await reviewService.reveal(scope,data.sessionId),{headers:privateHeaders});}catch(error){return learningFailure(error);}}
