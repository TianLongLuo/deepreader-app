import {beforeEach,expect,it,vi} from 'vitest';
const {auth,list}=vi.hoisted(()=>({auth:vi.fn(),list:vi.fn()}));
vi.mock('@/lib/auth',()=>({requireAuth:auth}));
vi.mock('@/server/documents/document.service',()=>({documentService:{listDocuments:list}}));
import {GET} from '@/app/api/documents/route';
beforeEach(()=>{auth.mockReset();list.mockReset();});
it('returns 401 without listing documents when authentication is required',async()=>{
 auth.mockRejectedValue(new Error('Authentication required'));
 const r=await GET();expect(r.status).toBe(401);expect(list).not.toHaveBeenCalled();
});
it('preserves server error status for non-authentication failures',async()=>{
 auth.mockRejectedValue(new Error('Unexpected failure'));expect((await GET()).status).toBe(500);
});
