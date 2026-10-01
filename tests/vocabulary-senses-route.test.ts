import {expect,it,vi} from 'vitest';
const auth=vi.hoisted(()=>({requireAuth:vi.fn()}));vi.mock('@/lib/auth',()=>auth);
import {GET,POST} from '@/app/api/study/vocabulary/senses/route';
it('requires login/origin and refuses forged result payloads or oversized change lists',async()=>{
 auth.requireAuth.mockRejectedValue(new Error('Authentication required'));expect((await GET(new Request('http://reader.test/api/study/vocabulary/senses?senseId=x'))).status).toBe(401);
 auth.requireAuth.mockResolvedValue({id:'test-user',workspaceId:'test-workspace'});
 expect((await POST(new Request('http://reader.test/api/study/vocabulary/senses',{method:'POST',headers:{origin:'http://evil.test',host:'reader.test','sec-fetch-site':'cross-site'},body:'{}'}))).status).toBe(403);
 expect((await POST(new Request('http://reader.test/api/study/vocabulary/senses',{method:'POST',body:JSON.stringify({action:'confirm',senseId:'x',dictionarySenseId:'a'.repeat(64),revision:0,result:{meaningZh:'injected'}})}))).status).toBe(400);
 expect((await POST(new Request('http://reader.test/api/study/vocabulary/senses',{method:'POST',body:JSON.stringify({action:'merge',sourceIds:Array(21).fill('x'),targetId:'y'})}))).status).toBe(400);
 expect((await GET(new Request('http://reader.test/api/study/vocabulary/senses?senseId=x&userId=another'))).status).toBe(400);
});
