import {expect,it,vi} from 'vitest';
vi.mock('@/lib/auth',()=>({requireAuth:async()=>({id:'fixture'})}));
import {GET} from '@/app/api/dictionary/route';
it.each([['en','occasion'],['es','niño']])('serves %s Chinese entries selected through the API',async(lang,word)=>{const res=await GET(new Request(`http://localhost/api/dictionary?word=${encodeURIComponent(word)}&language=${lang}&definitionLanguage=zh`));expect(res.status).toBe(200);expect((await res.json()).definitionLanguage).toBe('zh');});
it('rejects unsupported definition languages',async()=>{expect((await GET(new Request('http://localhost/api/dictionary?word=hello&definitionLanguage=../zh'))).status).toBe(400);});
