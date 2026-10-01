import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({auth:vi.fn(),find:vi.fn(),resolve:vi.fn(),generate:vi.fn()}));
vi.mock('@/lib/auth',()=>({requireAuth:mocks.auth}));
vi.mock('@/lib/prisma',()=>({prisma:{document:{findFirst:mocks.find}}}));
vi.mock('@/server/ai/config-resolver',()=>({aiConfigResolver:{resolve:mocks.resolve}}));
vi.mock('@/server/reading-assistant/meaning-groups',async importOriginal=>({...await importOriginal<any>(),generateMeaningGroups:mocks.generate}));
import {POST} from '@/app/api/meaning-groups/route';
const request=(body:unknown)=>new Request('http://localhost/api/meaning-groups',{method:'POST',body:typeof body==='string'?body:JSON.stringify(body)});
beforeEach(()=>{vi.clearAllMocks();mocks.auth.mockResolvedValue({id:'reader',email:'reader@example.test',workspaceId:'own'});mocks.find.mockResolvedValue({id:'doc'});mocks.resolve.mockResolvedValue({model:'fixture'});mocks.generate.mockResolvedValue({text:'Hello.',groups:[{start:0,end:6,text:'Hello.'}],verbs:[]});});
it('checks document ownership before configuring or invoking a model',async()=>{mocks.find.mockResolvedValue(null);const r=await POST(request({documentId:'other',text:'Hello.'}));expect(r.status).toBe(404);expect(mocks.resolve).not.toHaveBeenCalled();expect(mocks.find.mock.calls[0][0].where.workspaceId).toBe('own');});
it.each(['bad JSON',{documentId:'doc',text:'x'.repeat(4001)},{documentId:'doc',text:'Hi',sourceLanguage:'fr'}])('rejects invalid requests without paid calls',async body=>{expect((await POST(request(body))).status).toBe(400);expect(mocks.generate).not.toHaveBeenCalled();});
it('returns private validated ranges and passes subscriber cancellation',async()=>{const r=await POST(request({documentId:'doc',text:'Hello.'}));expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('private, no-store');expect(mocks.generate.mock.calls[0][0]).toEqual({workspaceId:'own',userId:'reader'});expect(mocks.generate.mock.calls[0][3]).toBeInstanceOf(AbortSignal);});
it('sanitizes model errors, including malformed upstream JSON',async()=>{mocks.generate.mockRejectedValue(new SyntaxError('secret upstream detail'));const r=await POST(request({documentId:'doc',text:'Hello.'}));expect(r.status).toBe(502);expect(JSON.stringify(await r.json())).not.toContain('secret');});
it('stops automatic client loading when AI configuration is unavailable',async()=>{mocks.resolve.mockRejectedValue(new Error('provider secret'));const r=await POST(request({documentId:'doc',text:'Hello.'}));expect(r.status).toBe(503);expect(mocks.generate).not.toHaveBeenCalled();});
it('exposes a genuine limiter Retry-After without upstream details',async()=>{
 const {MeaningGroupLimitError}=await import('@/server/reading-assistant/meaning-groups');
 mocks.generate.mockRejectedValue(new MeaningGroupLimitError(17));
 const r=await POST(request({documentId:'doc',text:'Hello.'}));
 expect(r.status).toBe(429);expect(r.headers.get('retry-after')).toBe('17');
});
it('streams only after ownership checks and keeps the explicit JSON compatibility path',async()=>{
 mocks.resolve.mockResolvedValue({providerKey:'test',model:'test',settingsHash:'stream-route',promptVersion:'1',cacheEnabled:false,maxTokens:3000,provider:{complete:vi.fn(),stream:async function*(){yield {content:'{"groups":[{"text":"Hello."}]}'};}}});
 const req=new Request('http://localhost/api/meaning-groups',{method:'POST',headers:{Accept:'application/x-ndjson'},body:JSON.stringify({documentId:'doc',text:'Hello.'})});
 const r=await POST(req);expect(r.headers.get('content-type')).toContain('application/x-ndjson');
 const {consumeAIStream}=await import('@/lib/ai-stream');
 expect(await consumeAIStream(r,new AbortController().signal,()=>{})).toMatchObject({text:'Hello.'});expect(mocks.generate).not.toHaveBeenCalled();
});
it.each([401,403])('rejects streaming access with %s before a generator starts',async status=>{
 if(status===401)mocks.auth.mockRejectedValue(new Error('Authentication required'));else mocks.auth.mockResolvedValue({id:'u'});
 const r=await POST(new Request('http://localhost/api/meaning-groups',{method:'POST',headers:{Accept:'application/x-ndjson'},body:JSON.stringify({documentId:'doc',text:'Hello.'})}));
 expect(r.status).toBe(status);expect(mocks.generate).not.toHaveBeenCalled();expect(mocks.resolve).not.toHaveBeenCalled();
});
