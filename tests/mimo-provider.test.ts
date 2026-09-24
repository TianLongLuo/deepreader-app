import { afterEach, expect, it, vi } from 'vitest';
import { MimoProvider } from '@/server/ai/mimo.provider';
import { MIMO_BASE_URLS, validateMimoBaseUrl } from '@/server/ai/mimo-config';
const config={baseUrl:MIMO_BASE_URLS.cn,apiKey:'tp-test-secret',model:'mimo-v2.6-pro',temperature:.2,maxTokens:500,topP:1,timeoutMs:100,retryCount:2};
afterEach(()=>vi.unstubAllGlobals());
it('allows only exact official endpoints',()=>{
 for (const url of Object.values(MIMO_BASE_URLS))expect(validateMimoBaseUrl(url+'/')).toBe(url);
 for(const url of ['http://api.xiaomimimo.com/v1','https://api.xiaomimimo.com.evil.test/v1','https://x@api.xiaomimimo.com/v1','https://api.xiaomimimo.com/v1?key=x','https://api.xiaomimimo.com/other'])expect(()=>new MimoProvider({...config,baseUrl:url})).toThrow();
});
it('sends MiMo model, api-key and completion token limit without DeepSeek parameters',async()=>{
 const fetcher=vi.fn().mockResolvedValue(Response.json({choices:[{message:{content:'{"answer":"ok"}'}}],usage:{total_tokens:6}}));vi.stubGlobal('fetch',fetcher);
 const result=await new MimoProvider(config).complete({systemPrompt:'Return JSON',userPrompt:'test',maxTokens:321});
 const [url,options]=fetcher.mock.calls[0];const body=JSON.parse(options.body);
 expect(url).toBe(MIMO_BASE_URLS.cn+'/chat/completions');expect(options.headers['api-key']).toBe('tp-test-secret');expect(options.redirect).toBe('error');
 expect(body.model).toBe('mimo-v2.6-pro');expect(body.max_completion_tokens).toBe(321);expect(body.max_tokens).toBeUndefined();expect(body.thinking).toEqual({type:'disabled'});expect(body.response_format).toEqual({type:'json_object'});expect(result.provider).toBe('mimo');
});
it('parses SSE chunks split across transport boundaries',async()=>{
 const encoder=new TextEncoder();const parts=['data: {"choices":[{"delta":{"con','tent":"hello"}}]}\r\n\r\ndata: {"choices":[{"delta":{"content":" world"}}]}\n\ndata: [DONE]\n\n'];
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(new ReadableStream({start(c){parts.forEach(p=>c.enqueue(encoder.encode(p)));c.close();}}),{headers:{'Content-Type':'text/event-stream'}})));
 const chunks=[];for await(const chunk of new MimoProvider(config).stream({systemPrompt:'test',userPrompt:'test'}))chunks.push(chunk.content);expect(chunks.join('')).toBe('hello world');
});
it.each(['complete','stream'] as const)('propagates cancellation without retry (%s)',async method=>{
 const abort=new AbortController();const fetcher=vi.fn((_u,options)=>new Promise((_resolve,reject)=>{options.signal.addEventListener('abort',()=>reject(options.signal.reason));queueMicrotask(()=>abort.abort());}));vi.stubGlobal('fetch',fetcher);
 const provider=new MimoProvider(config);const request={systemPrompt:'test',userPrompt:'test',signal:abort.signal};
 const run=async()=>{if(method==='complete')return provider.complete(request);for await(const chunk of provider.stream(request))void chunk;};
 await expect(run()).rejects.toMatchObject({name:'AbortError'});expect(fetcher).toHaveBeenCalledTimes(1);
});
it('times out requests and never reflects upstream error body or credentials',async()=>{
 vi.stubGlobal('fetch',vi.fn((_u,options)=>new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason)))));
 await expect(new MimoProvider({...config,timeoutMs:10}).complete({systemPrompt:'test',userPrompt:'test'})).rejects.toMatchObject({name:'TimeoutError'});
 const fetcher=vi.fn().mockResolvedValue(new Response('secret upstream body',{status:401}));vi.stubGlobal('fetch',fetcher);
 await expect(new MimoProvider(config).complete({systemPrompt:'test',userPrompt:'test'})).rejects.toThrow('authentication failed');expect(fetcher).toHaveBeenCalledTimes(1);
});
it('verifies the structured JSON capability used by reading requests',async()=>{
 const fetcher=vi.fn().mockResolvedValue(Response.json({choices:[{finish_reason:'stop',message:{content:'{"ok":true}'}}]}));vi.stubGlobal('fetch',fetcher);
 expect((await new MimoProvider(config).testConnection()).success).toBe(true);
 const payload=JSON.parse(fetcher.mock.calls[0][1].body);
 expect(payload.response_format).toEqual({type:'json_object'});expect(payload.thinking).toEqual({type:'disabled'});
 fetcher.mockResolvedValue(Response.json({choices:[{message:{content:'Hello'}}]}));
 expect((await new MimoProvider(config).testConnection()).success).toBe(false);
});
it.each(['complete','stream'] as const)('rejects truncated MiMo output rather than returning partial success (%s)',async method=>{
 const body={choices:[{finish_reason:'length',message:{content:'{"ok":true}'},delta:{content:'{"ok":true}'}}]};
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(method==='complete'?Response.json(body):new Response('data: '+JSON.stringify(body)+'\n\ndata: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}})));
 const provider=new MimoProvider(config);
 const run=async()=>{if(method==='complete')return provider.complete({systemPrompt:'JSON',userPrompt:'test'});for await(const chunk of provider.stream({systemPrompt:'JSON',userPrompt:'test'}))void chunk;};
 await expect(run()).rejects.toThrow('truncated');
});
