import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({find:vi.fn(),resolve:vi.fn(),warn:vi.fn()}));
vi.mock('@/lib/prisma',()=>({prisma:{paragraph:{findUnique:mocks.find}}}));
vi.mock('@/server/ai/config-resolver',()=>({aiConfigResolver:{resolve:mocks.resolve}}));
vi.mock('@/lib/redis',()=>({cacheService:{}}));
vi.mock('@/lib/logger',()=>({createChildLogger:()=>({info:vi.fn(),warn:mocks.warn,error:vi.fn()})}));
import {AIExplanationService} from '@/server/ai/explanation.service';
const collect=async(events:AsyncIterable<unknown>)=>{for await(const _event of events){}};
beforeEach(()=>{vi.clearAllMocks();mocks.find.mockResolvedValue({id:'p',rawText:'I waited.',textHash:'hash',document:{workspaceId:'w'},sentences:[]});});
const options={paragraphId:'p',forceRegenerate:true,signal:new AbortController().signal};
const config=(stream?:unknown)=>({provider:{complete:vi.fn().mockResolvedValue({content:'{}'}),stream},providerKey:'fixture',model:'fixture',maxTokens:3000,settingsHash:'1',promptVersion:'1',cacheEnabled:false,saveRawPrompt:false,saveRawResponse:false,saveRequestInput:false});
it('does not fall back to complete when paragraph streaming is unsupported',async()=>{
 const c=config();mocks.resolve.mockResolvedValue(c);
 await expect(collect(new AIExplanationService().streamExplain('w',options))).rejects.toMatchObject({code:'STREAM_UNSUPPORTED'});expect(c.provider.complete).not.toHaveBeenCalled();
});
it('does not silently restart after a displayed paragraph draft or log provider secrets',async()=>{
 const c=config(async function*(){yield {content:'{"paragraph_summary":"draft'};throw new Error('sk-provider-secret');});mocks.resolve.mockResolvedValue(c);
 await expect(collect(new AIExplanationService().streamExplain('w',options))).rejects.toThrow();expect(c.provider.complete).not.toHaveBeenCalled();expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain('sk-provider-secret');
});
it('rejects malformed paragraph final output without invoking a hidden nonstream repair',async()=>{
 const c=config(async function*(){yield {content:'{"paragraph_summary":"unfinished'};});mocks.resolve.mockResolvedValue(c);
 await expect(collect(new AIExplanationService().streamExplain('w',options))).rejects.toMatchObject({code:'INVALID_OUTPUT'});expect(c.provider.complete).not.toHaveBeenCalled();
});
