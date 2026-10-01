import {expect,it} from 'vitest';
import {createEmptyCard,fsrs,Rating} from 'ts-fsrs';
import {newReviewCard,scheduleReview,decodeReviewCard} from '@/server/review/scheduler';
it('matches the official default scheduler and preserves all card fields including steps',()=>{
 const now=new Date('2026-10-01T00:00:00Z'),card=createEmptyCard(now);
 const expected=fsrs({enable_fuzz:false}).next(card,now,Rating.Good);
 expect(newReviewCard(now)).toEqual(card);
 const result=scheduleReview(card,'good',now,{enable_fuzz:false});expect(result).toEqual(expected);
 expect(decodeReviewCard(JSON.stringify(result.card))).toEqual(result.card);
 expect(scheduleReview(result.card,'again',new Date(now.getTime()+600000),{enable_fuzz:false})).toEqual(fsrs({enable_fuzz:false}).next(result.card,new Date(now.getTime()+600000),Rating.Again));
});
it('rejects malformed persisted dates, state, missing steps, negative or nonfinite counters',()=>{
 const card=createEmptyCard(new Date());
 for(const override of [{due:'not-a-date'},{last_review:'not-a-date'},{reps:-1},{difficulty:null},{state:8},{learning_steps:undefined}])expect(()=>decodeReviewCard(JSON.stringify({...card,...override}))).toThrow();
});
