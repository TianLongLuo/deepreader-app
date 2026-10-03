import {afterEach,beforeEach,expect,it,vi} from 'vitest';
beforeEach(()=>{vi.resetModules();vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-03T00:00:00Z'));});afterEach(()=>vi.useRealTimers());
it('shares two active slots across callers and releases each slot only once',async()=>{
 const {acquireReadingAIQuota,ReadingAILimitError}=await import('@/server/reading-assistant/reading-ai-budget');
 const scope={workspaceId:'w',userId:'shared'},meaning=acquireReadingAIQuota(scope),flip=acquireReadingAIQuota(scope);
 expect(()=>acquireReadingAIQuota(scope)).toThrow(ReadingAILimitError);meaning();meaning();
 const repair=acquireReadingAIQuota(scope);expect(()=>acquireReadingAIQuota(scope)).toThrow(ReadingAILimitError);repair();flip();
 const again=acquireReadingAIQuota(scope),second=acquireReadingAIQuota(scope);expect(()=>acquireReadingAIQuota(scope)).toThrow(ReadingAILimitError);again();second();
});
it('counts 24 acquisitions including repairs, reports the remaining window and resets after 60 seconds',async()=>{
 const {acquireReadingAIQuota,checkReadingAIQuota}=await import('@/server/reading-assistant/reading-ai-budget'),scope={workspaceId:'w',userId:'rate'};
 for(let i=0;i<24;i++)acquireReadingAIQuota(scope)();vi.advanceTimersByTime(43000);
 try{checkReadingAIQuota(scope);throw new Error('expected limit');}catch(error){expect(error).toMatchObject({code:'RATE_LIMITED',retryAfterSeconds:17});}
 const other=acquireReadingAIQuota({workspaceId:'w',userId:'other'});other();vi.advanceTimersByTime(17000);expect(()=>acquireReadingAIQuota(scope)()).not.toThrow();
});
it('bounds owner storage, prunes only expired inactive entries and keeps active work occupied',async()=>{
 const {acquireReadingAIQuota,ReadingAILimitError}=await import('@/server/reading-assistant/reading-ai-budget');
 const active=acquireReadingAIQuota({workspaceId:'w',userId:'active'});
 for(let i=0;i<255;i++)acquireReadingAIQuota({workspaceId:'w',userId:'u'+i})();
 expect(()=>acquireReadingAIQuota({workspaceId:'w',userId:'overflow'})).toThrow(ReadingAILimitError);
 vi.advanceTimersByTime(60000);const fresh=acquireReadingAIQuota({workspaceId:'w',userId:'overflow'});fresh();
 const second=acquireReadingAIQuota({workspaceId:'w',userId:'active'});expect(()=>acquireReadingAIQuota({workspaceId:'w',userId:'active'})).toThrow(ReadingAILimitError);active();second();
});
