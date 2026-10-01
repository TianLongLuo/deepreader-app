import {NextResponse} from 'next/server';
import {vocabularyService} from '@/server/vocabulary/service';
import {learningUser,learningFailure,privateHeaders} from '@/server/vocabulary/http';
export async function GET(req:Request){try{const scope=await learningUser(req),input=Object.fromEntries(new URL(req.url).searchParams);return NextResponse.json(await vocabularyService.list(scope,input),{headers:privateHeaders});}catch(error){return learningFailure(error);}}
