import {expect,it} from 'vitest';
import {createReadingRestoreController} from '@/components/reader/reading-restore';
const contains=(range:{start:string;end:string},anchor:string)=>Number(range.start)<=Number(anchor)&&Number(anchor)<=Number(range.end);
it('does not save a temporary start before all proofs and anchor containment',()=>{
 const c=createReadingRestoreController(),saved={location:'20',percentage:30};c.seedConfirmed(saved);const gen=c.begin(saved,'flow');
 expect(c.confirmProgress(gen,{location:'0',percentage:0})).toBe(false);
 for(const proof of ['displayed','projection-rebound','geometry-stable','rendered'] as const)c.mark(gen,proof);
 expect(c.phase()).toBe('restoring');c.relocated(gen,{start:'0',end:'4'},contains);expect(c.phase()).toBe('restoring');
 c.relocated(gen,{start:'18',end:'24'},contains);expect(c.phase()).toBe('ready');expect(c.lastConfirmed()).toEqual(saved);
 expect(c.confirmProgress(gen,{location:'24',percentage:32})).toBe(true);expect(c.lastConfirmed()).toEqual({location:'24',percentage:32});
});
it('ignores stale failures, proofs and relocated events and captures immutable snapshots',()=>{
 const c=createReadingRestoreController(),saved={location:'20',percentage:30};c.seedConfirmed(saved);saved.location='90';
 const old=c.begin({location:'20',percentage:30},'resize'),gen=c.begin({location:'40',percentage:50},'typography');
 c.fail(old,new Error('old'));c.relocated(old,{start:'40',end:'44'},contains);
 for(const proof of ['displayed','projection-rebound','geometry-stable','rendered'] as const)c.mark(old,proof);
 expect(c.phase()).toBe('restoring');expect(c.lastConfirmed()?.location).toBe('20');
 c.relocated(gen,{start:'40',end:'44'},contains);for(const proof of ['displayed','projection-rebound','geometry-stable','rendered'] as const)c.mark(gen,proof);
 expect(c.phase()).toBe('ready');const copy=c.lastConfirmed()!;copy.location='oops';expect(c.lastConfirmed()?.location).toBe('40');
 c.fail(gen,new Error('new'));expect(c.phase()).toBe('error');expect(c.confirmProgress(gen,{location:'0',percentage:0})).toBe(false);
});
it('accepts the authoritative saved snapshot while the first restore is still loading',()=>{
 const c=createReadingRestoreController();c.begin({location:'',percentage:0},'initial');c.seedConfirmed({location:'20',percentage:30});
 expect(c.lastConfirmed()).toEqual({location:'20',percentage:30});
 c.seedConfirmed({location:'99',percentage:99});expect(c.lastConfirmed()?.location).toBe('20');
});
