import {expect,it,vi} from 'vitest';
import {generateMeaningGroups,MeaningGroupLimitError} from '@/server/reading-assistant/meaning-groups';
import type {ResolvedAIConfig} from '@/server/ai/config-resolver';
const input={documentId:'doc',sourceLanguage:'en' as const,text:'The Greek polis developed slowly.'};
const config=(complete=vi.fn().mockResolvedValue({content:JSON.stringify({groups:[{text:'The Greek polis'},{text:'developed slowly.',verbs:['developed']}]})})):ResolvedAIConfig=>({provider:{complete},providerKey:'test',model:'test',maxTokens:10000,promptVersion:'1',settingsHash:'1',cacheEnabled:true,saveRawPrompt:false,saveRawResponse:false,saveRequestInput:false});
it('deduplicates requests and isolates cached results by user, document, language and model',async()=>{
 const c=config(),scope={workspaceId:'groups-workspace',userId:'one'};
 await Promise.all([generateMeaningGroups(scope,input,c),generateMeaningGroups(scope,input,c)]);await generateMeaningGroups(scope,input,c);
 expect(c.provider.complete).toHaveBeenCalledTimes(1);
 await generateMeaningGroups({...scope,userId:'two'},input,c);
 await generateMeaningGroups(scope,{...input,documentId:'other'},c);
 await generateMeaningGroups(scope,{...input,sourceLanguage:'es'},c);
 await generateMeaningGroups(scope,input,{...c,model:'other'});
 expect(c.provider.complete).toHaveBeenCalledTimes(5);
 const request=vi.mocked(c.provider.complete).mock.calls[0][0];expect(request.maxTokens).toBeLessThanOrEqual(3000);expect(request.systemPrompt).toContain('untrusted');
});
it('never caches invalid or partial chunks',async()=>{
 const c=config(vi.fn().mockResolvedValue({content:JSON.stringify({groups:[{text:'The Greek polis'}]})}));
 for(let i=0;i<2;i++)await expect(generateMeaningGroups({workspaceId:'bad',userId:'bad'},input,c)).rejects.toThrow();
 expect(c.provider.complete).toHaveBeenCalledTimes(4);
});
it('does not call a provider for an already-cancelled request',async()=>{const c=config(),a=new AbortController();a.abort();await expect(generateMeaningGroups({workspaceId:'abort',userId:'abort'},input,c,a.signal)).rejects.toMatchObject({name:'AbortError'});expect(c.provider.complete).not.toHaveBeenCalled();});
it('caps concurrent new calls and releases slots after cancellation',async()=>{
 const complete=vi.fn().mockImplementation(({signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true})));
 const c=config(complete),scope={workspaceId:'concurrency',userId:'concurrency'};
 const a=new AbortController(),b=new AbortController();
 const first=generateMeaningGroups(scope,{...input,documentId:'1'},c,a.signal);
 const second=generateMeaningGroups(scope,{...input,documentId:'2'},c,b.signal);
 const settled=Promise.allSettled([first,second]);
 await vi.waitFor(()=>expect(complete).toHaveBeenCalledTimes(2));
 await expect(generateMeaningGroups(scope,{...input,documentId:'3'},c)).rejects.toBeInstanceOf(MeaningGroupLimitError);
 a.abort();b.abort();await settled;
 await vi.waitFor(()=>expect(vi.mocked(complete).mock.calls.every(([request])=>request.signal.aborted)).toBe(true));
 await expect(generateMeaningGroups(scope,{...input,documentId:'4'},config())).resolves.toHaveProperty('groups');
});
it('limits sequential new requests to 24 per minute without charging cache hits',async()=>{
 const c=config(),scope={workspaceId:'rate',userId:'rate'};
 for(let i=0;i<24;i++)await generateMeaningGroups(scope,{...input,documentId:String(i)},c);
 await expect(generateMeaningGroups(scope,{...input,documentId:'0'},c)).resolves.toHaveProperty('groups');
 await expect(generateMeaningGroups(scope,{...input,documentId:'25'},c)).rejects.toBeInstanceOf(MeaningGroupLimitError);
 expect(c.provider.complete).toHaveBeenCalledTimes(24);
});
it('reports the remaining rate-limit window rather than a fixed full minute',async()=>{
 vi.useFakeTimers();try{
  const c=config(),scope={workspaceId:'remaining-window',userId:'remaining-window'};
  for(let i=0;i<24;i++)await generateMeaningGroups(scope,{...input,documentId:String(i)},c);
  vi.setSystemTime(Date.now()+7500);
  await expect(generateMeaningGroups(scope,{...input,documentId:'25'},c)).rejects.toMatchObject({retryAfterSeconds:53});
 }finally{vi.useRealTimers();}
});
