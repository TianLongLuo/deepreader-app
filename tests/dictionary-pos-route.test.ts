import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({auth:vi.fn(),lookup:vi.fn()}));
vi.mock('@/lib/auth',()=>({requireAuth:m.auth}));
vi.mock('@/server/reading-assistant/dictionary',async importOriginal=>({...await importOriginal<object>(),lookupDictionary:m.lookup}));
import {GET} from '@/app/api/dictionary/pos/route';
beforeEach(()=>{m.auth.mockReset().mockResolvedValue({id:'reader'});m.lookup.mockReset().mockResolvedValue({meanings:[{partOfSpeech:'noun / verb',definitions:[{definition:'omitted'}]}]});});
it('returns only local POS metadata, validates language and avoids AI',async()=>{
 const r=await GET(new Request('http://local/api/dictionary/pos?word=bank&language=en'));expect(r.status).toBe(200);expect(await r.json()).toEqual({parts:['noun','verb']});expect(r.headers.get('cache-control')).toContain('private');
 expect((await GET(new Request('http://local/api/dictionary/pos?word=bank&language=xx'))).status).toBe(400);
});
it('requires authentication before looking up a word',async()=>{
 m.auth.mockRejectedValue(new Error('Authentication required'));expect((await GET(new Request('http://local/api/dictionary/pos?word=bank'))).status).toBe(401);expect(m.lookup).not.toHaveBeenCalled();
});
