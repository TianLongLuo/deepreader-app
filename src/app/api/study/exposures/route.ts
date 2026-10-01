import {NextResponse} from 'next/server';
import {z} from 'zod';
import {prisma} from '@/lib/prisma';
import {createExposureService} from '@/server/vocabulary/exposures';
import {learningUser,learningBody,learningFailure,privateHeaders} from '@/server/vocabulary/http';
const schema=z.object({documentId:z.string().min(1).max(200),sourceLanguage:z.enum(['en','es']),units:z.array(z.object({location:z.string().min(1).max(1000).refine(v=>v.startsWith('epubcfi(')||v.startsWith('pdf:')),sourceText:z.string().min(1).max(1200)}).strict()).min(1).max(8)}).strict();
export async function POST(req:Request){try{const scope=await learningUser(req,true),input=schema.parse(await learningBody(req)),service=createExposureService(prisma);for(const unit of input.units)await service.recordExposures(scope,input.documentId,input.sourceLanguage,unit.location,unit.sourceText);return NextResponse.json({recorded:true},{headers:privateHeaders});}catch(error){return learningFailure(error);}}
