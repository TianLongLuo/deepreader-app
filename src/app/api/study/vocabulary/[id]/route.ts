import {NextResponse} from 'next/server';
import {z} from 'zod';
import {vocabularyService} from '@/server/vocabulary/service';
import {learningUser,learningBody,learningFailure,privateHeaders} from '@/server/vocabulary/http';
type Context={params:Promise<{id:string}>};
const id=z.string().min(1).max(200),query=z.object({definitionLanguage:z.enum(['en','zh']).default('zh')}).strict();
export async function GET(req:Request,context:Context){try{const scope=await learningUser(req),key=id.parse((await context.params).id),input=query.parse(Object.fromEntries(new URL(req.url).searchParams));return NextResponse.json(await vocabularyService.detail(scope,key,input.definitionLanguage),{headers:privateHeaders});}catch(error){return learningFailure(error);}}
export async function PATCH(req:Request,context:Context){try{const scope=await learningUser(req,true),key=id.parse((await context.params).id);return NextResponse.json(await vocabularyService.edit(scope,key,await learningBody(req)),{headers:privateHeaders});}catch(error){return learningFailure(error);}}
export async function DELETE(req:Request,context:Context){try{const scope=await learningUser(req,true),key=id.parse((await context.params).id);return NextResponse.json(await vocabularyService.remove(scope,key),{headers:privateHeaders});}catch(error){return learningFailure(error);}}
