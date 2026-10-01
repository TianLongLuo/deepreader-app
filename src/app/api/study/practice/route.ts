import {NextResponse} from 'next/server';
import {prisma} from '@/lib/prisma';
import {createPracticeService} from '@/server/practice/service';
import {practiceInputSchema} from '@/server/practice/types';
import {learningUser,learningBody,learningFailure,privateHeaders} from '@/server/vocabulary/http';
import {aiStreamResponse} from '@/server/ai/stream-response';
export const runtime='nodejs';export const maxDuration=240;
const service=createPracticeService(prisma);
export async function POST(req:Request){try{const scope=await learningUser(req,true),input=practiceInputSchema.parse(await learningBody(req));return aiStreamResponse(req.signal,signal=>service.streamPractice(scope,input,signal));}catch(error){return learningFailure(error);}}
export async function GET(req:Request){try{const scope=await learningUser(req),params=new URL(req.url).searchParams;if(params.get('preview')==='1'){const raw=Object.fromEntries(params);delete raw.preview;const input=practiceInputSchema.parse({...raw,...(raw.targetCount?{targetCount:Number(raw.targetCount)}:{}),...(raw.wordCount?{wordCount:Number(raw.wordCount)}:{})});const selection=await service.selectPracticeTargets(scope,input);return NextResponse.json({targets:selection.targets.map(t=>({senseId:t.senseId,lemma:t.lemma})),deferred:selection.deferred},{headers:privateHeaders});}const rows=await prisma.learningTask.findMany({where:scope,orderBy:{createdAt:'desc'},take:20,select:{id:true}}),items=[];for(const row of rows){try{items.push(await service.getPractice(scope,row.id));}catch{}}return NextResponse.json({items},{headers:privateHeaders});}catch(error){return learningFailure(error);}}
