import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  disk: '{}', mkdir: vi.fn(), access: vi.fn(), readFile: vi.fn(), writeFile: vi.fn(),
  encrypt: vi.fn(), decrypt: vi.fn(), maskApiKey: vi.fn(), requireAdmin: vi.fn(),
  provider: vi.fn(), testConnection: vi.fn(),
}));
vi.mock('fs/promises',()=>({default:{mkdir:mocks.mkdir,access:mocks.access,readFile:mocks.readFile,writeFile:mocks.writeFile}}));
vi.mock('@/lib/crypto',()=>({encrypt:mocks.encrypt,decrypt:mocks.decrypt,maskApiKey:mocks.maskApiKey}));
vi.mock('@/lib/auth',()=>({requireAdmin:mocks.requireAdmin}));
vi.mock('@/server/ai/mimo.provider',()=>({MimoProvider:class {constructor(config:unknown){mocks.provider(config);}testConnection(){return mocks.testConnection();}}}));
import { AppConfigService } from '@/server/app-config/app-config.service';
import { DEFAULT_MIMO_MODEL, DEFAULT_MIMO_BASE_URL, MIMO_BASE_URLS } from '@/server/ai/mimo-config';
import { POST } from '@/app/api/dracconsole/config/test/route';
const secret='tp-example-sensitive-key';
beforeEach(()=>{
 vi.clearAllMocks();mocks.disk='{}';
 mocks.mkdir.mockResolvedValue(undefined);mocks.access.mockResolvedValue(undefined);
 mocks.readFile.mockImplementation(async()=>mocks.disk);
 mocks.writeFile.mockImplementation(async(_path:string,value:string)=>{mocks.disk=value;});
 mocks.encrypt.mockReturnValue('opaque-encrypted-value');mocks.decrypt.mockReturnValue(secret);mocks.maskApiKey.mockReturnValue('tp-****-key');
 mocks.requireAdmin.mockResolvedValue({id:'admin'});mocks.testConnection.mockResolvedValue({success:true,message:'Connected',latencyMs:1});
});
it('loads legacy configs with MiMo disabled and safe defaults',async()=>{
 mocks.disk=JSON.stringify({globalAiProvider:'gemini',allowRegistrations:false});
 const service=new AppConfigService();const config=await service.getAdminConfig();
 expect(config.globalAiProvider).toBe('gemini');expect(config.hasGlobalMimoApiKey).toBe(false);
 expect(config.globalMimoModel).toBe(DEFAULT_MIMO_MODEL);expect(config.globalMimoBaseUrl).toBe(DEFAULT_MIMO_BASE_URL);
 expect(await service.getPublicConfig()).toEqual({allowRegistrations:false});
});
it('encrypts trimmed MiMo keys, returns masked config, and resolves saved model and endpoint',async()=>{
 const service=new AppConfigService();const result=await service.updateConfig({globalAiProvider:'mimo',globalMimoApiKey:` ${secret} `,globalMimoModel:' mimo-custom-model ',globalMimoBaseUrl:MIMO_BASE_URLS.sgp});
 expect(mocks.encrypt).toHaveBeenCalledWith(secret);expect(mocks.maskApiKey).toHaveBeenCalledWith(secret);
 expect(mocks.disk).not.toContain(secret);expect(JSON.parse(mocks.disk).globalMimoApiKeyEncrypted).toBe('opaque-encrypted-value');
 expect(result).toMatchObject({hasGlobalMimoApiKey:true,globalMimoApiKeyPreview:'tp-****-key',globalMimoModel:'mimo-custom-model',globalMimoBaseUrl:MIMO_BASE_URLS.sgp});
 expect(result).not.toHaveProperty('globalMimoApiKeyEncrypted');expect(JSON.stringify(await service.getAdminConfig())).not.toContain(secret);
 expect(await service.getGlobalAIConfig()).toEqual({providerKey:'mimo',apiKey:secret,baseUrl:MIMO_BASE_URLS.sgp,model:'mimo-custom-model'});
});
it('preserves the key on blank updates and clears it without resurrecting a default',async()=>{
 const service=new AppConfigService();await service.updateConfig({globalAiProvider:'mimo',globalMimoApiKey:secret});
 await service.updateConfig({globalMimoApiKey:'  '});expect((await service.getAdminConfig()).hasGlobalMimoApiKey).toBe(true);
 await service.updateConfig({clearGlobalMimoApiKey:true,globalMimoApiKey:'ignored'});
 expect(await service.getAdminConfig()).toMatchObject({hasGlobalMimoApiKey:false,globalMimoApiKeyPreview:null});
 expect(await service.getGlobalAIConfig()).toBeNull();expect((await service.getUserAIAccess('reader@example.com')).canUseSharedGlobalAi).toBe(false);
});
it('uses MiMo key availability and sharing policy instead of the legacy built-in DeepSeek key',async()=>{
 const service=new AppConfigService();await service.updateConfig({globalAiProvider:'mimo',shareGlobalDeepSeekWithUsers:true});
 expect((await service.getUserAIAccess('reader@example.com')).canUseSharedGlobalAi).toBe(false);
 await service.updateConfig({globalMimoApiKey:secret});expect((await service.getUserAIAccess('reader@example.com')).canUseSharedGlobalAi).toBe(true);
 await service.updateConfig({shareGlobalDeepSeekWithUsers:false});
 expect(await service.getUserAIAccess('reader@example.com')).toMatchObject({canUseSharedGlobalAi:false,canManageOwnAiSettings:false});
 expect(await service.getUserAIAccess(' ADMIN@qq.com ')).toMatchObject({isPrimaryAdmin:true,canUseSharedGlobalAi:true,canManageOwnAiSettings:true});
});
it('rejects untrusted endpoint updates before persisting and rejects tampered stored endpoints',async()=>{
 const service=new AppConfigService();await expect(service.updateConfig({globalMimoApiKey:secret,globalMimoBaseUrl:'https://evil.example/v1'})).rejects.toThrow('official HTTPS');
 expect(mocks.writeFile).not.toHaveBeenCalled();expect(mocks.encrypt).not.toHaveBeenCalled();
 mocks.disk=JSON.stringify({globalAiProvider:'mimo',globalMimoApiKeyEncrypted:'cipher',globalMimoBaseUrl:'https://evil.example/v1'});
 await expect(service.getGlobalAIConfig()).rejects.toThrow('official HTTPS');
});
it('denies non-admin tests before accessing storage or creating a provider',async()=>{
 mocks.requireAdmin.mockRejectedValue(new Error('Forbidden'));
 expect((await POST()).status).toBe(403);expect(mocks.readFile).not.toHaveBeenCalled();expect(mocks.provider).not.toHaveBeenCalled();
});
it('tests the saved MiMo credentials with no key included in response',async()=>{
 const service=new AppConfigService();await service.updateConfig({globalMimoApiKey:secret,globalMimoBaseUrl:MIMO_BASE_URLS.ams,globalMimoModel:'mimo-saved'});
 const result=await POST();expect(result.status).toBe(200);
 expect(mocks.provider).toHaveBeenCalledWith(expect.objectContaining({apiKey:secret,baseUrl:MIMO_BASE_URLS.ams,model:'mimo-saved',retryCount:0}));
 expect(await result.text()).not.toContain(secret);
});
it('rejects tests without a saved MiMo key and sanitizes provider setup errors',async()=>{
 expect((await POST()).status).toBe(400);expect(mocks.provider).not.toHaveBeenCalled();
 mocks.disk=JSON.stringify({globalMimoApiKeyEncrypted:'cipher'});mocks.decrypt.mockImplementation(()=>{throw new Error(secret);});
 const result=await POST();expect(result.status).toBe(400);expect(await result.text()).not.toContain(secret);
});
