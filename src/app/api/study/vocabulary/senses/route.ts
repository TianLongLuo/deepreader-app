import {NextResponse} from 'next/server';
import {z} from 'zod';
import {prisma} from '@/lib/prisma';
import {createSenseService,senseActionSchema} from '@/server/vocabulary/senses';
import {vocabularyWhere} from '@/server/vocabulary/query';
import {VocabularyError} from '@/server/vocabulary/scope';
import {learningUser,learningBody,learningFailure,privateHeaders} from '@/server/vocabulary/http';
const service=createSenseService(prisma);
export async function GET(req:Request){try{const scope=await learningUser(req),input=z.object({senseId:z.string().min(1).max(200)}).strict().parse(Object.fromEntries(new URL(req.url).searchParams)),sense=await prisma.vocabularySense.findFirst({where:{id:input.senseId,...vocabularyWhere(scope)},select:{lemma:true,sourceLanguage:true,revision:true,confirmedDictionaryId:true}});if(!sense)throw new VocabularyError('义项不存在',404);return NextResponse.json({revision:sense.revision,selectedDictionarySenseId:sense.confirmedDictionaryId,candidates:await service.candidates(sense.lemma,sense.sourceLanguage as 'en'|'es'),changes:await service.history(scope,input.senseId)},{headers:privateHeaders});}catch(error){return learningFailure(error);}}
export async function POST(req:Request){try{const scope=await learningUser(req,true),input=senseActionSchema.parse(await learningBody(req));return NextResponse.json(input.action==='merge'?await service.merge(scope,input.sourceIds,input.targetId):input.action==='split'?await service.split(scope,input.senseId,input.encounterIds):await service.confirm(scope,input.senseId,input.dictionarySenseId,input.revision),{headers:privateHeaders});}catch(error){return learningFailure(error);}}
