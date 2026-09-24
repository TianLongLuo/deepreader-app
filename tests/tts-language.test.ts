import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({requireAuth:vi.fn(),synthesize:vi.fn()}));
vi.mock('@/lib/auth',()=>({requireAuth:mocks.requireAuth}));
vi.mock('@/server/audio/mimo-tts.service',()=>({mimoTTSService:{synthesize:mocks.synthesize}}));
import {POST} from '@/app/api/tts/mimo/route';
beforeEach(()=>{vi.clearAllMocks();mocks.requireAuth.mockResolvedValue({id:'test'});mocks.synthesize.mockResolvedValue({audio:Buffer.from('audio'),mimeType:'audio/mpeg',cached:false});});
const request=(body:unknown)=>new Request('http://localhost/api/tts/mimo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
it('never sends Spanish text to the configured English voice',async()=>{
  const response=await POST(request({text:'El niño lee.',sourceLanguage:'es'}));
  expect(response.status).toBe(422);
  expect(await response.json()).toMatchObject({code:'USE_DEVICE_SPANISH_VOICE'});
  expect(mocks.synthesize).not.toHaveBeenCalled();
});
it('preserves English pronunciation for legacy clients',async()=>{
  const response=await POST(request({text:'The child reads.'}));
  expect(response.status).toBe(200);
  expect(mocks.synthesize).toHaveBeenCalledWith('The child reads.');
});
it('rejects invalid source languages before contacting the voice provider',async()=>{
  expect((await POST(request({text:'hola',sourceLanguage:'invalid'}))).status).toBe(400);
  expect(mocks.synthesize).not.toHaveBeenCalled();
});
