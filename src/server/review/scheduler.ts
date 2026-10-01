import {createEmptyCard,fsrs,Rating,type Card,type FSRSParameters} from 'ts-fsrs';
import {z} from 'zod';
const date=z.string().datetime({offset:true}).transform(value=>new Date(value));
const nonnegative=z.number().finite().nonnegative();
const cardSchema=z.object({due:date,stability:nonnegative,difficulty:nonnegative.max(10),elapsed_days:nonnegative,scheduled_days:nonnegative,learning_steps:nonnegative.int(),reps:nonnegative.int(),lapses:nonnegative.int(),state:z.number().int().min(0).max(3),last_review:date.optional()}).strict();
export function newReviewCard(now:Date):Card{return createEmptyCard(now);}
export function decodeReviewCard(raw:string):Card{return cardSchema.parse(JSON.parse(raw)) as Card;}
export function scheduleReview(card:Card,rating:'again'|'good',now:Date,parameters?:Partial<FSRSParameters>){return fsrs(parameters).next(card,now,rating==='again'?Rating.Again:Rating.Good);}
