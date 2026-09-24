import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({disk:'{}',workspace:vi.fn(),user:vi.fn(),document:vi.fn(),fetch:vi.fn(),auth:vi.fn(),admin:vi.fn(),read:vi.fn(),write:vi.fn()}));
vi.mock('fs/promises',()=>({default:{mkdir:vi.fn().mockResolvedValue(undefined),access:vi.fn().mockResolvedValue(undefined),readFile:mocks.read,writeFile:mocks.write}}));
vi.mock('@/lib/crypto',()=>({encrypt:(key:string)=>'encrypted:'+key,decrypt:(key:string)=>key.replace(/^encrypted:/,''),maskApiKey:()=> 'tp-****test',hashSettings:(value:unknown)=>JSON.stringify(value),hashText:(value:string)=>value}));
vi.mock('@/lib/auth',()=>({requireAuth:mocks.auth,requireAdmin:mocks.admin}));
vi.mock('@/lib/prisma',()=>({prisma:{aIProviderConfig:{findFirst:mocks.workspace},promptTemplate:{findFirst:vi.fn().mockResolvedValue(null)},user:{findUnique:mocks.user},document:{findFirst:mocks.document}}}));
vi.mock('@/lib/logger',()=>({createChildLogger:()=>({info:vi.fn(),warn:vi.fn(),error:vi.fn()})}));
import { appConfigService } from '@/server/app-config/app-config.service';
import { aiConfigResolver } from '@/server/ai/config-resolver';
import { POST as reading } from '@/app/api/reading-assistant/route';
import { POST as testSaved } from '@/app/api/dracconsole/config/test/route';
import { MIMO_BASE_URLS } from '@/server/ai/mimo-config';
const key='tp-fake-wiring-test';
let serial=0;
beforeEach(()=>{
 vi.clearAllMocks();serial++;mocks.disk='{}';mocks.read.mockImplementation(async()=>mocks.disk);mocks.write.mockImplementation(async(_p:string,value:string)=>{mocks.disk=value;});
 mocks.workspace.mockResolvedValue(null);mocks.user.mockResolvedValue(null);mocks.document.mockResolvedValue({id:'doc'});
 mocks.auth.mockResolvedValue({id:'user-'+serial,workspaceId:'workspace',email:'reader@example.com'});mocks.admin.mockResolvedValue({id:'admin'});
 mocks.fetch.mockImplementation(async(_url:string,options:RequestInit)=>{
  const payload=JSON.parse(String(options.body));const prompt=payload.messages[1].content;let quote='';try {quote=JSON.parse(prompt).sourceText||'';}catch{}
  if(payload.messages[0].content.includes('shape') && prompt.includes('ok')) return Response.json({model:payload.model,choices:[{message:{content:'{"ok":true}'}}]});
  return Response.json({model:payload.model,choices:[{message:{content:JSON.stringify({answer:'已分析',citations:quote?[{quote}]:[],questions:quote?[{question:'主句是什么？',answer:'见原文',quote}]:[]})}}]});
 });vi.stubGlobal('fetch',mocks.fetch);
});
afterEach(()=>vi.unstubAllGlobals());
async function configure(){await appConfigService.updateConfig({globalAiProvider:'mimo',globalMimoApiKey:key,globalMimoBaseUrl:MIMO_BASE_URLS.cn,globalMimoModel:'mimo-v2.6-pro',shareGlobalDeepSeekWithUsers:true});}
function request(mode:string,sourceLanguage:'en'|'es'='es'){return new Request('http://localhost/api/reading-assistant',{method:'POST',body:JSON.stringify({documentId:'doc',mode,sourceLanguage,text:sourceLanguage==='es'?'Ojalá hubiera venido.':'I wish he had come.',question:'解释这句话',language:'Chinese',level:'intermediate'})});}
it.each(['en','es'] as const)('wires saved active MiMo through every frontend mode (%s)',async language=>{
 await configure();for(const mode of ['quick','explain','translate','ask','summary','quiz','word']){const response=await reading(request(mode,language));expect(response.status).toBe(200);const body=await response.json();expect(body.answer).toContain('已分析');expect(body).toMatchObject({provider:'mimo',model:'mimo-v2.6-pro'});}
 expect(mocks.fetch).toHaveBeenCalledTimes(7);
 for(const [url,options] of mocks.fetch.mock.calls){const payload=JSON.parse(options.body);expect(url).toBe(MIMO_BASE_URLS.cn+'/chat/completions');expect(options.headers['api-key']).toBe(key);expect(payload.model).toBe('mimo-v2.6-pro');expect(payload.max_completion_tokens).toBeGreaterThan(0);expect(payload.max_tokens).toBeUndefined();expect(payload.thinking).toEqual({type:'disabled'});expect(JSON.parse(payload.messages[1].content).sourceLanguage).toBe(language);}
});
it('admin connection test and frontend use the same saved MiMo endpoint/key/model',async()=>{
 await configure();expect((await testSaved()).status).toBe(200);expect((await reading(request('quick'))).status).toBe(200);
 expect(mocks.fetch).toHaveBeenCalledTimes(2);const [adminCall,readerCall]=mocks.fetch.mock.calls;
 expect(adminCall[0]).toBe(readerCall[0]);expect(adminCall[1].headers['api-key']).toBe(readerCall[1].headers['api-key']);expect(JSON.parse(adminCall[1].body).model).toBe(JSON.parse(readerCall[1].body).model);
});
it('cleared active MiMo key fails closed instead of silently selecting admin DeepSeek',async()=>{
 await configure();await appConfigService.updateConfig({clearGlobalMimoApiKey:true});
 mocks.user.mockResolvedValue({workspaceMembers:[{workspaceId:'admin-workspace'}]});
 mocks.workspace.mockImplementation(async(args)=>args.where.workspaceId==='admin-workspace'?{providerKey:'deepseek',model:'deepseek-chat',baseUrl:'https://api.deepseek.com',encryptedApiKey:'encrypted:sk-fake',maxTokens:1000,temperature:.3,topP:1,timeoutMs:1000,retryCount:0,cacheEnabled:true}:null);
 const response=await reading(request('quick'));expect(response.status).toBe(502);expect(mocks.fetch).not.toHaveBeenCalled();
});
it('changing the official endpoint invalidates cached frontend answers',async()=>{
 await configure();expect((await reading(request('quick'))).status).toBe(200);expect((await reading(request('quick'))).status).toBe(200);expect(mocks.fetch).toHaveBeenCalledTimes(1);
 await appConfigService.updateConfig({globalMimoBaseUrl:MIMO_BASE_URLS.sgp});expect((await reading(request('quick'))).status).toBe(200);expect(mocks.fetch).toHaveBeenCalledTimes(2);expect(mocks.fetch.mock.calls[1][0]).toBe(MIMO_BASE_URLS.sgp+'/chat/completions');
});
it('resolved provider streams from the same saved MiMo configuration',async()=>{
 await configure();const encoder=new TextEncoder();mocks.fetch.mockResolvedValue(new Response(new ReadableStream({start(controller){controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"hola"}}]}\n\ndata: [DONE]\n\n'));controller.close();}}),{headers:{'Content-Type':'text/event-stream'}}));
 const resolved=await aiConfigResolver.resolve('workspace','reader@example.com');let content='';for await(const chunk of resolved.provider.stream!({systemPrompt:'Explain',userPrompt:'Hola'}))content+=chunk.content;expect(content).toBe('hola');expect(mocks.fetch.mock.calls[0][0]).toBe(MIMO_BASE_URLS.cn+'/chat/completions');expect(mocks.fetch.mock.calls[0][1].headers['api-key']).toBe(key);
});
it('rotating the saved MiMo key invalidates frontend cache',async()=>{
 await configure();expect((await reading(request('quick'))).status).toBe(200);expect((await reading(request('quick'))).status).toBe(200);expect(mocks.fetch).toHaveBeenCalledTimes(1);
 await appConfigService.updateConfig({globalMimoApiKey:'tp-fake-rotated-key'});
 const response=await reading(request('quick'));expect(response.status).toBe(200);expect(await response.json()).toMatchObject({provider:'mimo',model:'mimo-v2.6-pro'});
 expect(mocks.fetch).toHaveBeenCalledTimes(2);expect(mocks.fetch.mock.calls[1][1].headers['api-key']).toBe('tp-fake-rotated-key');
});
it('disabling shared MiMo blocks ordinary readers while the primary admin still uses selected MiMo',async()=>{
 await configure();await appConfigService.updateConfig({shareGlobalDeepSeekWithUsers:false});
 expect((await reading(request('quick'))).status).toBe(502);expect(mocks.fetch).not.toHaveBeenCalled();
 mocks.auth.mockResolvedValue({id:'admin-user',workspaceId:'admin-workspace',email:'admin@qq.com'});
 mocks.workspace.mockResolvedValue({providerKey:'deepseek',model:'deepseek-chat',baseUrl:'https://api.deepseek.com',encryptedApiKey:'encrypted:sk-fake',maxTokens:1000,temperature:.3,topP:1,timeoutMs:1000,retryCount:0,cacheEnabled:true});
 const response=await reading(request('quick'));expect(response.status).toBe(200);expect(await response.json()).toMatchObject({provider:'mimo',model:'mimo-v2.6-pro'});expect(mocks.fetch).toHaveBeenCalledTimes(1);expect(mocks.fetch.mock.calls[0][0]).toBe(MIMO_BASE_URLS.cn+'/chat/completions');
});
