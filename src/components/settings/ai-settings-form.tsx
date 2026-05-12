'use client';

import { useState, useEffect } from 'react';
import { useDraft } from '@/hooks/use-draft';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AIProviderSettings } from '@/types/ai';

export default function AISettingsForm({ initialData }: { initialData: any }) {
  const [loading, setLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; latency?: number } | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const defaultValues: AIProviderSettings = {
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

  // Merge default values properly if initialData is empty Object
  const mergedInitialData = initialData && Object.keys(initialData).length > 0 
    ? { ...defaultValues, ...initialData } 
    : defaultValues;

  const formKey = 'ai_settings_draft';
  const { draft, hasDraft, updateDraft, discardDraft } = useDraft<any>(formKey, mergedInitialData);
  
  // Update draft from initialData if local storage is empty and initialData has properties
  useEffect(() => {
    if (!hasDraft && initialData && Object.keys(initialData).length > 0) {
      updateDraft({ ...defaultValues, ...initialData, apiKey: '' });
    }
  }, [initialData, hasDraft]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target as HTMLInputElement;
    let finalValue: any = value;
    
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
    } catch (e) {
      setTestResult({ success: false, message: 'Request failed to execute' });
    } finally {
      setTestLoading(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
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
      updateDraft({ ...draft, apiKey: '', maskedApiKeyPreview: data.maskedApiKeyPreview });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e) {
      alert(`Save failed: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative z-10 space-y-6">
      {hasDraft && draft.apiKey === '' && !saveSuccess && (
        <div className="flex items-center justify-between rounded-2xl border border-orange-300 bg-orange-100/80 p-4 text-sm font-semibold text-orange-800">
          <span>You have unsaved changes drafted locally.</span>
          <Button variant="ghost" size="sm" onClick={discardDraft}>Discard Draft</Button>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-orange-950">🐾 DeepSeek Connection Settings</CardTitle>
          <CardDescription className="text-orange-900/60">Configure the connection to the DeepSeek AI platform.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-orange-900/65">Base URL</label>
              <Input
                name="baseUrl"
                value={draft.baseUrl || ''}
                onChange={handleChange}
                placeholder="https://api.deepseek.com"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-orange-900/65">API Key</label>
              <Input
                type="password"
                name="apiKey"
                value={draft.apiKey || ''}
                onChange={handleChange}
                placeholder={draft.maskedApiKeyPreview || "sk-..."}
              />
              <p className="text-xs text-orange-900/50">
                {draft.maskedApiKeyPreview ? `Saved key: ${draft.maskedApiKeyPreview}` : 'Key is encrypted at rest securely.'}
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-orange-900/65">Model Name</label>
              <Input
                name="model"
                value={draft.model || ''}
                onChange={handleChange}
                placeholder="deepseek-v4-flash"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-orange-900/65">Timeout (ms)</label>
              <Input
                type="number"
                name="timeoutMs"
                value={draft.timeoutMs || 300000}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="flex flex-col justify-between gap-4 border-t border-orange-200/70 pt-4 sm:flex-row sm:items-center">
            <Button variant="outline" onClick={handleTestConnection} disabled={testLoading}>
              {testLoading ? 'Testing...' : 'Test Connection'}
            </Button>
            {testResult && (
              <div className={`text-sm py-2 px-3 rounded-md font-medium ${testResult.success ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                {testResult.success ? `✓ ${testResult.message} (${testResult.latency}ms)` : `⚠️ ${testResult.message}`}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-orange-950">🧶 Generation Defaults</CardTitle>
          <CardDescription className="text-orange-900/60">Configure how explanations are generated by default.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-orange-900/65">Temperature</label>
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
              <label className="text-sm font-semibold text-orange-900/65">Max Tokens</label>
              <Input
                type="number"
                name="maxTokens"
                value={draft.maxTokens || 384000}
                onChange={handleChange}
              />
            </div>
          </div>
          
          <div className="grid gap-4 pt-4 sm:grid-cols-2">
            <label className="flex cursor-pointer items-center space-x-3 rounded-2xl border border-orange-200 bg-orange-50/70 p-4 text-sm font-semibold text-orange-950 transition-colors hover:bg-orange-100/70">
              <input type="checkbox" name="cacheEnabled" checked={draft.cacheEnabled ?? true} onChange={handleChange} className="h-4 w-4 rounded text-orange-500 focus:ring-orange-400 accent-orange-500" />
              <span>Enable AI Response Caching</span>
            </label>
            <label className="flex cursor-pointer items-center space-x-3 rounded-2xl border border-orange-200 bg-orange-50/70 p-4 text-sm font-semibold text-orange-950 transition-colors hover:bg-orange-100/70">
              <input type="checkbox" name="saveRequestInput" checked={draft.saveRequestInput ?? false} onChange={handleChange} className="h-4 w-4 rounded text-orange-500 focus:ring-orange-400 accent-orange-500" />
              <span>Log Raw Request Intput</span>
            </label>
          </div>
        </CardContent>
        <CardFooter className="justify-end border-t border-orange-200/70 bg-orange-50/70">
          <Button onClick={handleSave} disabled={loading} className="w-32">
            {loading ? 'Saving...' : saveSuccess ? 'Saved ✓' : 'Save Settings'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
