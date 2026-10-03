'use client';

import {signalReadingAISettingsChanged} from '@/lib/reading-ai-epoch';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useDraft } from '@/hooks/use-draft';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AIProviderSettings } from '@/types/ai';

type AISettingsFormData = AIProviderSettings & { maskedApiKeyPreview?: string };
type AISettingsFormProps = { initialData: Partial<AISettingsFormData>; userId: string };
const defaultValues: AISettingsFormData = {
    providerKey: 'deepseek',
    isEnabled: true,
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-v4-flash',
    temperature: 0.3,
    maxTokens: 384000,
    topP: 1.0,
    timeoutMs: 300000,
    retryCount: 3,
    streamingEnabled: false,
    saveRawPrompt: false,
    saveRawResponse: false,
    saveRequestInput: false,
    cacheEnabled: true,
    isDefault: true,
    priority: 0,
    apiKey: '',
};

export default function AISettingsForm(props: AISettingsFormProps) {
  // An account change also drops in-memory credentials and old test results.
  return <AISettingsFormFields key={props.userId} {...props} />;
}
function AISettingsFormFields({ initialData,userId }: AISettingsFormProps) {
  const [saveError,setSaveError]=useState('');
  const [loading, setLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; latencyMs?: number } | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const mergedInitialData = useMemo(() => ({ ...defaultValues, ...initialData, apiKey: '' }), [initialData]);
  const sanitizeDraft = useCallback((value: AISettingsFormData) => ({ ...mergedInitialData, ...value, apiKey: '' }), [mergedInitialData]);

  const formKey = `ai_settings_draft:${userId}`;
  const { draft, hasDraft, updateDraft, discardDraft } = useDraft(formKey, mergedInitialData, sanitizeDraft);

  // The old unscoped draft has no provable owner; never migrate its credentials.
  useEffect(() => {
    try { localStorage.removeItem('draft:ai_settings_draft'); } catch {}
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target as HTMLInputElement;
    let finalValue: string | number | boolean = value;

    if (type === 'checkbox') {
      finalValue = (e.target as HTMLInputElement).checked;
    } else if (type === 'number') {
      finalValue = Number(value);
    }

    updateDraft({ ...draft, [name]: finalValue });
    setSaveSuccess(false);
  };

  const handleTestConnection = async () => {
    setTestLoading(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/settings/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: draft.apiKey || undefined,
          baseUrl: draft.baseUrl,
          model: draft.model,
          timeoutMs: draft.timeoutMs,
        }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch {
      setTestResult({ success: false, message: 'Request failed to execute' });
    } finally {
      setTestLoading(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);setSaveError('');
    setSaveSuccess(false);
    try {
      const res = await fetch('/api/settings/ai', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Update local storage but drop the apiKey since it's saved
      // The server save succeeded; blocked draft storage must not misreport it as failure.
      try{updateDraft({ ...draft, apiKey: '', maskedApiKeyPreview: data.maskedApiKeyPreview });}catch{}
      signalReadingAISettingsChanged(userId);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e) {
      setSaveError('保存失败：'+(e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative z-10 space-y-6">
      {hasDraft && draft.apiKey === '' && !saveSuccess && (
        <div className="flex items-center justify-between rounded-2xl border border-border bg-muted p-4 text-sm font-semibold text-muted-foreground">
          <span>你有尚未保存的本地草稿。</span>
          <Button variant="ghost" size="sm" onClick={discardDraft}>丢弃草稿</Button>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-foreground"> DeepSeek 连接</CardTitle>
          <CardDescription className="text-foreground">配置个人 AI 服务，不影响其他账户。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">接口地址</label>
              <Input
                name="baseUrl"
                value={draft.baseUrl || ''}
                onChange={handleChange}
                placeholder="https://api.deepseek.com"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">API Key</label>
              <Input
                type="password"
                name="apiKey"
                value={draft.apiKey || ''}
                onChange={handleChange}
                placeholder={draft.maskedApiKeyPreview || "sk-..."}
              />
              <p className="text-xs text-foreground">
                {draft.maskedApiKeyPreview ? `已保存密钥：${draft.maskedApiKeyPreview}` : '密钥加密保存；留空保留已有密钥。'}
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">模型名称</label>
              <Input
                name="model"
                value={draft.model || ''}
                onChange={handleChange}
                placeholder="deepseek-v4-flash"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">超时（毫秒）</label>
              <Input
                type="number"
                name="timeoutMs"
                value={draft.timeoutMs || 300000}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="flex flex-col justify-between gap-4 border-t border-border pt-4 sm:flex-row sm:items-center">
            <Button variant="outline" onClick={handleTestConnection} disabled={testLoading}>
              {testLoading ? '测试中…' : '测试连接'}
            </Button>
            {testResult && (
              <div className={`text-sm py-2 px-3 rounded-md font-medium ${testResult.success ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                {testResult.success ? `✓ ${testResult.message}${typeof testResult.latencyMs === 'number' ? ` (${testResult.latencyMs}ms)` : ''}` : `⚠️ ${testResult.message}`}
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">测试只验证连接；修改后请点击“保存设置”生效。</p>
        </CardContent>
      </Card>

      <Card>
        <details><summary className="cursor-pointer p-6 font-medium">高级参数</summary>
        <CardHeader>
          <CardTitle className="text-foreground"> 高级参数</CardTitle>
          <CardDescription className="text-foreground">调整解释生成与缓存选项。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">温度</label>
              <Input
                type="number"
                name="temperature"
                step="0.1"
                min="0"
                max="2"
                value={draft.temperature || 0}
                onChange={handleChange}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">最大输出 Token</label>
              <Input
                type="number"
                name="maxTokens"
                value={draft.maxTokens || 384000}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="grid gap-4 pt-4 sm:grid-cols-2">
            <label className="flex cursor-pointer items-center space-x-3 rounded-2xl border border-border bg-card p-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted">
              <input type="checkbox" name="cacheEnabled" checked={draft.cacheEnabled ?? true} onChange={handleChange} className="h-4 w-4 rounded text-primary focus:ring-primary accent-primary" />
              <span>缓存 AI 解释</span>
            </label>
            <label className="flex cursor-pointer items-center space-x-3 rounded-2xl border border-border bg-card p-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted">
              <input type="checkbox" name="saveRequestInput" checked={draft.saveRequestInput ?? false} onChange={handleChange} className="h-4 w-4 rounded text-primary focus:ring-primary accent-primary" />
              <span>记录原始请求内容</span>
            </label>
          </div>
        </CardContent>
        </details>
        <CardFooter className="justify-end border-t border-border bg-card">
          {saveError&&<p role="alert" className="mr-3 text-sm text-destructive">{saveError}</p>}
          <Button onClick={handleSave} disabled={loading} className="w-32">
            {loading ? '保存中…' : saveSuccess ? '已保存 ✓' : '保存设置'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
