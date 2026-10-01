import {expect,it,vi} from 'vitest';
const auth=vi.hoisted(()=>({requireAuth:vi.fn()}));vi.mock('@/lib/auth',()=>auth);
import {POST} from '@/app/api/study/exposures/route';
it('requires login and origin, refuses parser namespace and arbitrary statistic fields',async()=>{
 auth.requireAuth.mockRejectedValue(new Error('Authentication required'));expect((await POST(new Request('http://reader.test/api/study/exposures',{method:'POST',body:'{}'}))).status).toBe(401);
 auth.requireAuth.mockResolvedValue({id:'test-user',workspaceId:'test-workspace'});
 expect((await POST(new Request('http://reader.test/api/study/exposures',{method:'POST',headers:{origin:'http://evil.test',host:'reader.test','sec-fetch-site':'cross-site'},body:'{}'}))).status).toBe(403);
 for(const units of [[{location:'parsed:1',sourceText:'A word.'}],[{location:'epubcfi(/a)',sourceText:'A word.',frequency:999}]])expect((await POST(new Request('http://reader.test/api/study/exposures',{method:'POST',body:JSON.stringify({documentId:'test',sourceLanguage:'en',units})}))).status).toBe(400);
});
