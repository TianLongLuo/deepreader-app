// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,renderHook,screen,waitFor} from '@testing-library/react';
import {createElement} from 'react';
import {signalReadingAISettingsChanged,useReadingAIEpoch} from '@/lib/reading-ai-epoch';
import AISettingsForm from '@/components/settings/ai-settings-form';
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();localStorage.clear();});
it('changes only the matching account epoch with an opaque payload and no settings or secret data',()=>{
 const a=renderHook(()=>useReadingAIEpoch('epoch-alice')),b=renderHook(()=>useReadingAIEpoch('epoch-bob'));let detail:unknown;const listener=(event:Event)=>{detail=(event as CustomEvent).detail;};window.addEventListener('deepreader:reading-ai-settings',listener);const old=a.result.current;
 act(()=>signalReadingAISettingsChanged('epoch-alice'));expect(a.result.current).not.toBe(old);expect(b.result.current).toBe('0');expect(Object.keys(detail as object).sort()).toEqual(['epoch','userId']);expect(JSON.stringify(detail)).not.toMatch(/secret|apiKey|model|baseUrl/);window.removeEventListener('deepreader:reading-ai-settings',listener);
});
it('receives matching cross-tab epochs and remains usable with blocked storage',()=>{
 vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw new Error('blocked');});vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('blocked');});const h=renderHook(()=>useReadingAIEpoch('epoch-blocked'));
 act(()=>signalReadingAISettingsChanged('epoch-blocked'));expect(h.result.current).not.toBe('0');act(()=>window.dispatchEvent(new StorageEvent('storage',{key:'deepreader-reading-ai:epoch-blocked',newValue:'opaque-next-epoch'})));expect(h.result.current).toBe('opaque-next-epoch');h.unmount();
});
it('signals cache invalidation only after a successful authenticated settings save, not on failure',async()=>{
 const events:unknown[]=[],listener=(e:Event)=>events.push((e as CustomEvent).detail);window.addEventListener('deepreader:reading-ai-settings',listener);const fetch=vi.fn().mockResolvedValueOnce(Response.json({error:'fixture'},{status:500})).mockResolvedValueOnce(Response.json({maskedApiKeyPreview:'masked'}));vi.stubGlobal('fetch',fetch);
 render(createElement(AISettingsForm,{userId:'settings-reader',initialData:{}}));fireEvent.click(screen.getByRole('button',{name:'保存设置'}));await waitFor(()=>expect(screen.getByRole('alert')).toBeTruthy());expect(events).toEqual([]);fireEvent.click(screen.getByRole('button',{name:'保存设置'}));await waitFor(()=>expect(screen.getByRole('button',{name:'已保存 ✓'})).toBeTruthy());expect(events).toHaveLength(1);expect(events[0]).toMatchObject({userId:'settings-reader'});expect(JSON.stringify(events)).not.toContain('masked');window.removeEventListener('deepreader:reading-ai-settings',listener);
});
it('still signals a successful server save when persisting its local draft is blocked',async()=>{
 vi.stubGlobal('fetch',async()=>Response.json({maskedApiKeyPreview:'masked'}));vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new DOMException('blocked','SecurityError');});const h=renderHook(()=>useReadingAIEpoch('settings-blocked'));const before=h.result.current;
 render(createElement(AISettingsForm,{userId:'settings-blocked',initialData:{}}));fireEvent.click(screen.getByRole('button',{name:'保存设置'}));await waitFor(()=>expect(screen.getByRole('button',{name:'已保存 ✓'})).toBeTruthy());expect(h.result.current).not.toBe(before);expect(screen.queryByRole('alert')).toBeNull();
});
