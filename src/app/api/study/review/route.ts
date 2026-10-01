import {NextResponse} from 'next/server';
import {z} from 'zod';
import {reviewService} from '@/server/review/service';
import {learningUser,learningFailure,privateHeaders} from '@/server/vocabulary/http';
const query=z.object({definitionLanguage:z.enum(['en','zh']).default('zh'),sourceLanguage:z.enum(['en','es']).optional()}).strict();
export async function GET(req:Request){try{const scope=await learningUser(req),input=query.parse(Object.fromEntries(new URL(req.url).searchParams));const front=await reviewService.front(scope,input.definitionLanguage,input.sourceLanguage);return NextResponse.json({front,...await reviewService.summary(scope,input.sourceLanguage)},{headers:privateHeaders});}catch(error){return learningFailure(error);}}
