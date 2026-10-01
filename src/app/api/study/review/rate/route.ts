import {NextResponse} from 'next/server';
import {reviewService} from '@/server/review/service';
import {learningUser,learningBody,learningFailure,privateHeaders} from '@/server/vocabulary/http';
export async function POST(req:Request){try{const scope=await learningUser(req,true),data=await learningBody(req);return NextResponse.json(await reviewService.rate(scope,data),{headers:privateHeaders});}catch(error){return learningFailure(error);}}
