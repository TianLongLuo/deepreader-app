import {expect,it,vi} from 'vitest';
const auth=vi.hoisted(()=>({requireAuth:vi.fn()}));vi.mock('@/lib/auth',()=>auth);
import {POST} from '@/app/api/study/practice/route';
it('requires login, same origin and bounded discriminated practice parameters',async()=>{
 const request=(body:unknown,origin?:string)=>new Request('http://reader.test/api/study/practice',{method:'POST',headers:origin?{origin,host:'reader.test','sec-fetch-site':'cross-site'}:{},body:JSON.stringify(body)});
 auth.requireAuth.mockRejectedValue(new Error('Authentication required'));expect((await POST(request({}))).status).toBe(401);
 auth.requireAuth.mockResolvedValue({id:'test-user',workspaceId:'test-workspace'});expect((await POST(request({},'http://evil.test'))).status).toBe(403);
 for(const body of [{mode:'reading',sourceLanguage:'en',targetCount:99},{mode:'application',sourceLanguage:'es',wordCount:250},{mode:'reading',sourceLanguage:'en',answerKey:'forged'}])expect((await POST(request(body))).status).toBe(400);
});
