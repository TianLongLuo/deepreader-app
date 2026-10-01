import type {Prisma} from '@prisma/client';
import type {LearningScope} from '@/server/vocabulary/types';
import {activeDocument} from '@/server/vocabulary/scope';
const senseMeanings:Prisma.VocabularySenseWhereInput[]=[{manualMeaningEn:{not:''}},{manualMeaningZh:{not:''}},{manualMeaningEn:null,meaningEn:{not:''}},{manualMeaningZh:null,meaningZh:{not:''}}];
/** Eligibility and selected source must agree, including mixed pending/legacy merges. */
export function answerableEncounterWhere(scope:LearningScope):Prisma.VocabularyEncounterWhereInput{
 return {...scope,document:{workspaceId:scope.workspaceId,...activeDocument},OR:[{legacyContextMeaning:{not:''}},{sense:{...scope,OR:senseMeanings}}]};
}
export function reviewableSenseWhere(scope:LearningScope):Prisma.VocabularySenseWhereInput{
 return {...scope,status:{notIn:['merged','deleted']},encounters:{some:answerableEncounterWhere(scope)}};
}
