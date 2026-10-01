import {expect,it,vi} from 'vitest';
const auth=vi.hoisted(()=>({requireAuth:vi.fn()}));vi.mock('@/lib/auth',()=>auth);
import {GET,POST} from '@/app/api/study/vocabulary/[id]/enrichment/route';
const context={params:Promise.resolve({id:'fixture'})};
it('enrichment progress and retries require login, same origin, bounded IDs and strict input',async()=>{
 auth.requireAuth.mockRejectedValue(new Error('Authentication required'));expect((await GET(new Request('http://reader.test/api/study/vocabulary/fixture/enrichment'),context)).status).toBe(401);
 auth.requireAuth.mockResolvedValue({id:'test-user',workspaceId:'test-workspace'});
 const cross=await POST(new Request('http://reader.test/api/study/vocabulary/fixture/enrichment',{method:'POST',headers:{origin:'http://evil.test',host:'reader.test','sec-fetch-site':'cross-site'},body:'{}'}),context);expect(cross.status).toBe(403);expect(cross.headers.get('Cache-Control')).toContain('no-store');
 expect((await POST(new Request('http://reader.test/api/study/vocabulary/fixture/enrichment',{method:'POST',body:'{"userId":"another-user"}'}),context)).status).toBe(400);
 expect((await GET(new Request('http://reader.test/api/study/vocabulary/fixture/enrichment'),{params:Promise.resolve({id:'x'.repeat(201)})})).status).toBe(400);
});
