import {afterEach,expect,it,vi} from 'vitest';
import {type ProcessedExposure,createProcessedExposureQueue} from '@/lib/processed-exposures';
afterEach(()=>vi.useRealTimers());
it('deduplicates a completed source position but keeps identical text at different positions',async()=>{
 vi.useFakeTimers();const send=vi.fn(async(_items:ProcessedExposure[],_signal:AbortSignal)=>{}),queue=createProcessedExposureQueue(send);
 queue.add({location:'epubcfi(/a)',sourceText:'A word.'});queue.add({location:'epubcfi(/a)',sourceText:'A word.'});queue.add({location:'epubcfi(/b)',sourceText:'A word.'});await vi.advanceTimersByTimeAsync(150);
 expect(send).toHaveBeenCalledOnce();expect(send.mock.calls[0][0]).toHaveLength(2);
 queue.add({location:'epubcfi(/a)',sourceText:'A word.'});await vi.advanceTimersByTimeAsync(150);expect(send).toHaveBeenCalledOnce();queue.dispose();
});
it('bounds a recording batch to eight units, retries at most three times and cancels subscriptions',async()=>{
 vi.useFakeTimers();const send=vi.fn(async(_items:ProcessedExposure[],_signal:AbortSignal)=>{throw new Error('Temporary failure');}),queue=createProcessedExposureQueue(send);
 for(let i=0;i<8;i++)queue.add({location:'epubcfi(/'+i+')',sourceText:'A word.'});await vi.advanceTimersByTimeAsync(20100);expect(send).toHaveBeenCalledTimes(3);await vi.advanceTimersByTimeAsync(100000);expect(send).toHaveBeenCalledTimes(3);
 queue.add({location:'epubcfi(/later)',sourceText:'Later.'});queue.dispose();await vi.advanceTimersByTimeAsync(1000);expect(send).toHaveBeenCalledTimes(3);expect(send.mock.calls[0][1].aborted).toBe(true);
});
