import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({auth:vi.fn(),find:vi.fn(),resolve:vi.fn(),stream:vi.fn(),quota:vi.fn()}));
vi.mock('@/lib/auth',()=>({requireAuth:mocks.auth}));vi.mock('@/lib/prisma',()=>({prisma:{document:{findFirst:mocks.find}}}));vi.mock('@/server/ai/config-resolver',()=>({aiConfigResolver:{resolve:mocks.resolve}}));
vi.mock('@/server/reading-assistant/semantic-flip',()=>({streamSemanticFlip:mocks.stream,checkSemanticFlipQuota:mocks.quota}));
import {POST} from '@/app/api/semantic-flip/route';
import {ReadingAILimitError} from '@/server/reading-assistant/reading-ai-budget';
const input={documentId:'doc',sourceLanguage:'en',targetLanguage:'zh',sourceText:'An occasion.',start:3,end:11,targetWord:'occasion',occurrence:'word-1'};
const request=(body:unknown=input)=>new Request('http://localhost/api/semantic-flip',{method:'POST',body:typeof body==='string'?body:JSON.stringify(body)});
beforeEach(()=>{vi.clearAllMocks();mocks.auth.mockResolvedValue({id:'reader',workspaceId:'own',email:'reader@example.test'});mocks.find.mockResolvedValue({id:'doc'});mocks.resolve.mockResolvedValue({model:'fixture'});mocks.stream.mockImplementation(async function*(){yield {requestId:'fixture',type:'start',cached:false};yield {requestId:'fixture',type:'complete',value:{replacement:'场合',provider:'fixture',model:'fixture'}};});});
it.each([401,403,404,503])('checks access/configuration before a provider starts for %s',async status=>{
 if(status===401)mocks.auth.mockRejectedValue(new Error('Authentication required'));if(status===403)mocks.auth.mockResolvedValue({id:'reader'});if(status===404)mocks.find.mockResolvedValue(null);if(status===503)mocks.resolve.mockRejectedValue(new Error('secret key/provider URL'));
 const response=await POST(request());expect(response.status).toBe(status);expect(mocks.stream).not.toHaveBeenCalled();expect(JSON.stringify(await response.json())).not.toContain('secret');
});
it.each(['bad JSON',{...input,userId:'spoof'},{...input,start:0}])('rejects malformed input before configuring a model',async body=>{expect((await POST(request(body))).status).toBe(400);expect(mocks.resolve).not.toHaveBeenCalled();});
it('streams only sanitized validated completions with authenticated scope and document ownership',async()=>{
 const response=await POST(request());expect(response.headers.get('cache-control')).toContain('private, no-store');const {consumeAIStream}=await import('@/lib/ai-stream');
 expect(await consumeAIStream(response,new AbortController().signal,()=>{})).toMatchObject({replacement:'场合'});expect(mocks.stream.mock.calls[0][0]).toEqual({workspaceId:'own',userId:'reader'});
 expect(mocks.find.mock.calls[0][0]).toEqual({where:{id:'doc',workspaceId:'own',status:{notIn:['DELETED','DELETING']}},select:{id:true}});
});
it('rejects oversized UTF-8 while reading and cancels without consuming the entire body',async()=>{
 let reads=0,canceled=false;const chunk=new TextEncoder().encode('汉'.repeat(12000));
 const body=new ReadableStream<Uint8Array>({pull(controller){reads++;controller.enqueue(chunk);},cancel(){canceled=true;}});
 const req=new Request('http://localhost/api/semantic-flip',{method:'POST',body,duplex:'half',headers:{'Content-Length':'1'}} as RequestInit);
 expect((await POST(req)).status).toBe(413);expect(canceled).toBe(true);expect(reads).toBeLessThan(5);expect(mocks.resolve).not.toHaveBeenCalled();
});
it('returns Retry-After preflight and sanitizes in-stream quota errors',async()=>{
 mocks.quota.mockImplementation(()=>{throw new ReadingAILimitError(17);});const response=await POST(request());expect(response.status).toBe(429);expect(response.headers.get('retry-after')).toBe('17');
 mocks.quota.mockImplementation(()=>{});mocks.stream.mockImplementation(async function*(){yield {requestId:'fixture',type:'start',cached:false};throw new ReadingAILimitError(17);});
 const streamed=await POST(request());const text=await streamed.text();expect(text).toContain('RATE_LIMITED');expect(text).not.toContain('occasion');
});
