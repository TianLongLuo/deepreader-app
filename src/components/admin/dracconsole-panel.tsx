'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type ConsoleSnapshot = {
  adminConfig: {
    allowRegistrations: boolean;
    globalAiProvider: 'deepseek' | 'gemini' | 'mimo';
    shareGlobalDeepSeekWithUsers: boolean;
    allowUserAiSettings: boolean;
    hasGlobalDeepseekApiKey: boolean;
    globalDeepseekApiKeyPreview: string | null;
    hasGlobalGeminiApiKey: boolean;
    globalGeminiApiKeyPreview: string | null;
    globalGeminiModel: string;
    hasGlobalMimoApiKey: boolean;
    globalMimoApiKeyPreview: string | null;
    globalMimoModel: string;
    globalMimoBaseUrl: string;
  };
  totals: {
    registeredUsers: number;
    deepseekCalls: number;
    books: number;
  };
  latestLogin: {
    at: string | Date;
    email: string;
    name: string | null;
  } | null;
  users: Array<{
    id: string;
    email: string;
    name: string | null;
    role: string;
    createdAt: string | Date;
    lastLoginAt: string | Date | null;
    deepseekCalls: number;
    storageBytes: number;
    books: Array<{
      id: string;
      title: string;
      fileType: string;
      fileSize: number;
      createdAt: string | Date;
    }>;
  }>;
};

type AdminConfigPayload =
  | ConsoleSnapshot['adminConfig']
  | { error?: string };

export default function DracConsolePanel({
  initialSnapshot,
}: {
  initialSnapshot: ConsoleSnapshot;
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [globalDeepseekApiKeyDraft, setGlobalDeepseekApiKeyDraft] = useState('');
  const [globalGeminiApiKeyDraft, setGlobalGeminiApiKeyDraft] = useState('');
  const [globalGeminiModelDraft, setGlobalGeminiModelDraft] = useState(
    initialSnapshot.adminConfig.globalGeminiModel
  );
  const [mimoKey, setMimoKey] = useState('');
  const [mimoModel, setMimoModel] = useState(initialSnapshot.adminConfig.globalMimoModel);
  const [mimoBaseUrl, setMimoBaseUrl] = useState(initialSnapshot.adminConfig.globalMimoBaseUrl);
  const [mimoTest, setMimoTest] = useState('');
  const [isTestingMimo, setIsTestingMimo] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [userQuery,setUserQuery]=useState('');
  const [error, setError] = useState('');

  const handleConfigUpdate = (
    update: {
      allowRegistrations?: boolean;
      globalAiProvider?: 'deepseek' | 'gemini' | 'mimo';
      shareGlobalDeepSeekWithUsers?: boolean;
      allowUserAiSettings?: boolean;
      globalDeepseekApiKey?: string;
      clearGlobalDeepseekApiKey?: boolean;
      globalGeminiApiKey?: string;
      clearGlobalGeminiApiKey?: boolean;
      globalGeminiModel?: string;
      globalMimoApiKey?: string;
      clearGlobalMimoApiKey?: boolean;
      globalMimoModel?: string;
      globalMimoBaseUrl?: string;
    },
    fallbackError: string,
    afterSuccess?: () => void
  ) => {
    setError('');

    startTransition(async () => {
        try {
        const response = await fetch('/api/dracconsole/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(update),
        });

        const payload = (await response.json()) as AdminConfigPayload;

        if (!response.ok || !('allowRegistrations' in payload)) {
          setError(
            'error' in payload && payload.error ? payload.error : fallbackError
          );
          return;
        }

        setSnapshot((current) => ({
          ...current,
          adminConfig: payload,
        }));
        afterSuccess?.();
        } catch { setError(fallbackError); }
      });
  };

  const handleDeleteUser = (userId: string, email: string) => {
    const confirmed = window.confirm(
      `删除用户 ${email} 及其全部书籍、登录会话、AI 设置和工作区数据？`
    );

    if (!confirmed) {
      return;
    }

    setError('');

    startTransition(() => {
      void (async () => {
        const response = await fetch(`/api/dracconsole/users/${userId}`, {
          method: 'DELETE',
        });

        const payload = (await response.json()) as
          | { success: true }
          | { error?: string };

        if (!response.ok) {
          setError(
            'error' in payload && payload.error
              ? payload.error
              : '删除用户失败'
          );
          return;
        }

        setSnapshot((current) => {
          const nextUsers = current.users.filter((user) => user.id !== userId);
          return {
            ...current,
            totals: {
              ...current.totals,
              registeredUsers: nextUsers.length,
              books: nextUsers.reduce(
                (count, user) => count + user.books.length,
                0
              ),
              deepseekCalls: nextUsers.reduce(
                (count, user) => count + user.deepseekCalls,
                0
              ),
            },
            users: nextUsers,
          };
        });
      })();
    });
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) {
      return `${bytes} B`;
    }

    const units = ['KB', 'MB', 'GB'];
    let value = bytes / 1024;
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }

    return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unitIndex]}`;
  };

  return (
    <div className="relative z-10 space-y-8">
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="注册用户"
          value={String(snapshot.totals.registeredUsers)}
        />
        <StatCard
          label="AI 调用"
          value={String(snapshot.totals.deepseekCalls)}
        />
        <StatCard label="书籍" value={String(snapshot.totals.books)} />
        <StatCard
          label="注册状态"
          value={snapshot.adminConfig.allowRegistrations ? '开放' : '关闭'}
        />
        <StatCard
          label="当前 AI"
          value={snapshot.adminConfig.globalAiProvider === 'mimo' ? 'MiMo' : snapshot.adminConfig.globalAiProvider === 'gemini' ? 'Gemini' : 'DeepSeek'}
        />
        <StatCard
          label="个人 AI 配置权限"
          value={
            snapshot.adminConfig.allowUserAiSettings ? '已启用' : '已停用'
          }
        />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <ConfigCard
          title="注册开关"
          description="关闭后隐藏注册入口，并拒绝新的注册请求。"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Toggle
              checked={snapshot.adminConfig.allowRegistrations}
              disabled={isPending}
              onToggle={() =>
                handleConfigUpdate(
                  {
                    allowRegistrations:
                      !snapshot.adminConfig.allowRegistrations,
                  },
                  '注册开关更新失败'
                )
              }
            />
            <Button
              variant="secondary"
              disabled={isPending}
              onClick={() =>
                handleConfigUpdate(
                  {
                    allowRegistrations:
                      !snapshot.adminConfig.allowRegistrations,
                  },
                  '注册开关更新失败'
                )
              }
            >
              {snapshot.adminConfig.allowRegistrations
                ? '关闭注册'
                : '开放注册'}
            </Button>
          </div>
        </ConfigCard>

        <ConfigCard
          title="共享 AI 服务"
          description="选择共享的 AI 服务。启用共享后，全局配置优先于个人配置。"
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">
                当前共享服务
              </label>
              <select
                value={snapshot.adminConfig.globalAiProvider}
                onChange={(event) =>
                  handleConfigUpdate(
                    {
                      globalAiProvider: event.target.value as
                        | 'deepseek'
                        | 'gemini' | 'mimo',
                    },
                    '共享服务更新失败'
                  )
                }
                disabled={isPending}
                className="h-11 w-full rounded-2xl border border-border bg-card px-4 text-sm text-foreground"
              >
                <option value="mimo">MiMo / Token Plan</option>
                <option value="deepseek">DeepSeek Chat</option>
                  <option value="gemini">Gemini 3 Flash</option>
              </select>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Toggle
                checked={snapshot.adminConfig.shareGlobalDeepSeekWithUsers}
                disabled={isPending}
                onToggle={() =>
                  handleConfigUpdate(
                    {
                      shareGlobalDeepSeekWithUsers:
                        !snapshot.adminConfig.shareGlobalDeepSeekWithUsers,
                    },
                    '共享 AI 状态更新失败'
                  )
                }
              />
              <Button
                variant="secondary"
                disabled={isPending}
                onClick={() =>
                  handleConfigUpdate(
                    {
                      shareGlobalDeepSeekWithUsers:
                        !snapshot.adminConfig.shareGlobalDeepSeekWithUsers,
                    },
                    '共享 AI 状态更新失败'
                  )
                }
              >
                {snapshot.adminConfig.shareGlobalDeepSeekWithUsers
                  ? '关闭共享 AI'
                  : '开启共享 AI'}
              </Button>
            </div>

            <div className="space-y-3 border-t border-border pt-4">
              <div role="status" className="space-y-1 rounded-2xl border border-border bg-card p-3 text-sm">
                <p>MiMo 密钥：{snapshot.adminConfig.hasGlobalMimoApiKey ? '已保存' : '未保存'}</p>
                <p>当前活动服务：{snapshot.adminConfig.globalAiProvider === 'mimo' ? 'MiMo' : snapshot.adminConfig.globalAiProvider === 'gemini' ? 'Gemini' : 'DeepSeek'}</p>
                <p>全局 AI 共享：{snapshot.adminConfig.shareGlobalDeepSeekWithUsers ? '已开启' : '已关闭'}</p>
                {!snapshot.adminConfig.shareGlobalDeepSeekWithUsers && <p className="text-muted-foreground">共享关闭时，普通用户无法使用此全局 MiMo 配置。保存并启用不会自动打开共享。</p>}
                {snapshot.adminConfig.globalAiProvider !== 'mimo' && <p className="text-muted-foreground">已保存或测试成功不代表前端使用 MiMo；请保存并启用 MiMo。</p>}
                {(mimoKey.trim() || mimoModel !== snapshot.adminConfig.globalMimoModel || mimoBaseUrl !== snapshot.adminConfig.globalMimoBaseUrl) && <p>表单有未保存的更改；测试使用已保存配置。</p>}
              </div>
              <label htmlFor="mimo-endpoint" className="text-sm font-semibold">MiMo 接入方式</label>
              <select id="mimo-endpoint" value={mimoBaseUrl} onChange={e=>setMimoBaseUrl(e.target.value)} disabled={isPending} className="h-11 w-full rounded-2xl border border-border px-3">
                <option value="https://api.xiaomimimo.com/v1">按量付费 API</option>
                <option value="https://token-plan-cn.xiaomimimo.com/v1">Token Plan · 中国</option>
                <option value="https://token-plan-sgp.xiaomimimo.com/v1">Token Plan · 新加坡</option>
                <option value="https://token-plan-ams.xiaomimimo.com/v1">Token Plan · 欧洲</option>
              </select>
              <label htmlFor="mimo-model" className="text-sm font-semibold">MiMo 模型名称</label>
              <Input id="mimo-model" value={mimoModel} onChange={e=>setMimoModel(e.target.value)} placeholder="mimo-v2.6-pro" disabled={isPending} />
              <label htmlFor="mimo-key" className="text-sm font-semibold">MiMo API Key</label>
              <Input id="mimo-key" type="password" autoComplete="off" value={mimoKey} onChange={e=>setMimoKey(e.target.value)} placeholder={snapshot.adminConfig.globalMimoApiKeyPreview || 'sk-… / tp-… / ttp-…'} disabled={isPending} />
              <p className="text-xs text-foreground">模型名和地区以 MiMo 控制台为准。Token Plan 使用专属密钥，与按量付费密钥不可混用。留空保留已保存密钥。</p>
              <div className="flex flex-wrap gap-2">
                <Button disabled={isPending || !mimoModel.trim()} onClick={()=>handleConfigUpdate({globalMimoApiKey:mimoKey || undefined,globalMimoModel:mimoModel,globalMimoBaseUrl:mimoBaseUrl},'保存 MiMo 配置失败',()=>{setMimoKey('');setMimoTest('');})}>保存 MiMo 配置</Button>
                <Button disabled={isPending || !mimoModel.trim() || (!mimoKey.trim() && !snapshot.adminConfig.hasGlobalMimoApiKey)} onClick={()=>handleConfigUpdate({globalMimoApiKey:mimoKey.trim() || undefined,globalMimoModel:mimoModel.trim(),globalMimoBaseUrl:mimoBaseUrl,globalAiProvider:'mimo'},'保存并启用 MiMo 失败',()=>{setMimoKey('');setMimoTest('MiMo 配置已保存并设为当前活动服务。请检查全局 AI 共享状态，并在阅读器发起新请求验证本次模型。');})}>保存并启用 MiMo</Button>
                <Button variant="outline" disabled={isPending || !snapshot.adminConfig.hasGlobalMimoApiKey} onClick={()=>handleConfigUpdate({clearGlobalMimoApiKey:true},'清除 MiMo 密钥失败',()=>setMimoKey(''))}>清除密钥</Button>
                <Button variant="outline" disabled={isTestingMimo || isPending || !snapshot.adminConfig.hasGlobalMimoApiKey} onClick={async()=>{
                  setIsTestingMimo(true);setMimoTest('');
                  try {const response=await fetch('/api/dracconsole/config/test',{method:'POST'});const result=await response.json();setMimoTest(result.message || result.error || '测试失败');}catch{setMimoTest('网络错误，请重试');}finally{setIsTestingMimo(false);}
                }}>{isTestingMimo?'测试中…':'测试已保存的 MiMo 配置'}</Button>
              </div>
              {mimoTest && <p role="status" className="text-sm">{mimoTest}</p>}
            </div>

            <div className="space-y-2 border-t border-border pt-4">
              <label className="text-sm font-semibold text-foreground">
                全局 DeepSeek 密钥
              </label>
              <Input
                type="password"
                value={globalDeepseekApiKeyDraft}
                onChange={(event) =>
                  setGlobalDeepseekApiKeyDraft(event.target.value)
                }
                placeholder={
                  snapshot.adminConfig.globalDeepseekApiKeyPreview || 'sk-...'
                }
                disabled={isPending}
              />
              <p className="text-xs text-foreground">
                {snapshot.adminConfig.hasGlobalDeepseekApiKey
                  ? `已保存密钥：${snapshot.adminConfig.globalDeepseekApiKeyPreview}`
                  : '尚未保存全局 DeepSeek 密钥。'}
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button
                disabled={isPending || globalDeepseekApiKeyDraft.trim().length === 0}
                onClick={() =>
                  handleConfigUpdate(
                    {
                      globalDeepseekApiKey: globalDeepseekApiKeyDraft,
                    },
                    '保存 DeepSeek 密钥失败',
                    () => setGlobalDeepseekApiKeyDraft('')
                  )
                }
              >
                Apply DeepSeek Key
              </Button>
              <Button
                variant="outline"
                disabled={isPending || !snapshot.adminConfig.hasGlobalDeepseekApiKey}
                onClick={() =>
                  handleConfigUpdate(
                    {
                      clearGlobalDeepseekApiKey: true,
                    },
                    '清除 DeepSeek 密钥失败',
                    () => setGlobalDeepseekApiKeyDraft('')
                  )
                }
              >
                清除 DeepSeek 密钥
              </Button>
            </div>

            <div className="space-y-2 border-t border-border pt-4">
              <label className="text-sm font-semibold text-foreground">
                全局 Gemini 模型
              </label>
              <Input
                value={globalGeminiModelDraft}
                onChange={(event) =>
                  setGlobalGeminiModelDraft(event.target.value)
                }
                    placeholder="gemini-3-flash-preview"
                disabled={isPending}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">
                全局 Gemini 密钥
              </label>
              <Input
                type="password"
                value={globalGeminiApiKeyDraft}
                onChange={(event) =>
                  setGlobalGeminiApiKeyDraft(event.target.value)
                }
                placeholder={
                  snapshot.adminConfig.globalGeminiApiKeyPreview || 'AIza...'
                }
                disabled={isPending}
              />
              <p className="text-xs text-foreground">
                {snapshot.adminConfig.hasGlobalGeminiApiKey
                  ? `已保存密钥：${snapshot.adminConfig.globalGeminiApiKeyPreview}`
                  : '尚未保存全局 Gemini 密钥。'}
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button
                disabled={
                  isPending ||
                  (globalGeminiApiKeyDraft.trim().length === 0 &&
                    globalGeminiModelDraft.trim() ===
                      snapshot.adminConfig.globalGeminiModel)
                }
                onClick={() =>
                  handleConfigUpdate(
                    {
                      globalGeminiApiKey:
                        globalGeminiApiKeyDraft.trim().length > 0
                          ? globalGeminiApiKeyDraft
                          : undefined,
                      globalGeminiModel: globalGeminiModelDraft,
                    },
                    '保存 Gemini 配置失败',
                    () => setGlobalGeminiApiKeyDraft('')
                  )
                }
              >
                Apply Gemini Settings
              </Button>
              <Button
                variant="outline"
                disabled={isPending || !snapshot.adminConfig.hasGlobalGeminiApiKey}
                onClick={() =>
                  handleConfigUpdate(
                    {
                      clearGlobalGeminiApiKey: true,
                    },
                    '清除 Gemini 密钥失败',
                    () => setGlobalGeminiApiKeyDraft('')
                  )
                }
              >
                清除 Gemini 密钥
              </Button>
            </div>
          </div>
        </ConfigCard>

        <ConfigCard
          title="个人 AI 配置权限"
          description="允许用户编辑个人 AI 配置；外观与阅读偏好始终可用。"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Toggle
              checked={snapshot.adminConfig.allowUserAiSettings}
              disabled={isPending}
              onToggle={() =>
                handleConfigUpdate(
                  {
                    allowUserAiSettings:
                      !snapshot.adminConfig.allowUserAiSettings,
                  },
                  '个人配置权限更新失败'
                )
              }
            />
            <Button
              variant="secondary"
              disabled={isPending}
              onClick={() =>
                handleConfigUpdate(
                  {
                    allowUserAiSettings:
                      !snapshot.adminConfig.allowUserAiSettings,
                  },
                  '个人配置权限更新失败'
                )
              }
            >
              {snapshot.adminConfig.allowUserAiSettings
                ? '关闭个人配置'
                : '开放个人配置'}
            </Button>
          </div>
          <p className="mt-4 text-xs text-foreground">
            共享 AI 开启时优先使用全局配置。两项均关闭时，仅管理员可以使用 AI 功能。
          </p>
        </ConfigCard>
      </div>

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : null}

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm  backdrop-blur-xl">
        <h2 className="text-xl font-bold text-foreground"> 最近登录</h2>
        <p className="mt-2 text-sm text-foreground">
          {snapshot.latestLogin
            ? `${snapshot.latestLogin.name || '未命名用户'} (${snapshot.latestLogin.email}) at ${new Date(snapshot.latestLogin.at).toLocaleString()}`
            : '暂无登录记录'}
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm  backdrop-blur-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-foreground"> 用户</h2><input aria-label="搜索用户" placeholder="搜索用户" className="native-field mt-3" value={userQuery} onChange={e=>setUserQuery(e.target.value)}/>
            <p className="mt-2 text-sm text-foreground">
              密码仅以单向哈希保存，后台不会显示明文密码。
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4">
          {snapshot.users.filter(user=>(user.email+' '+user.name).toLowerCase().includes(userQuery.toLowerCase())).map((user) => (
            <div
              key={user.id}
              className="rounded-2xl border border-border bg-card p-5"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h3 className="text-lg font-semibold">
                    {user.name || '未命名用户'}
                  </h3>
                  <p className="text-sm text-foreground">{user.email}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge label={user.role} />
                  <Badge label={`${user.deepseekCalls} 次 AI 调用`} />
                  <Badge label={`${user.books.length} 本书`} />
                  <Badge label={`${formatBytes(user.storageBytes)} 存储`} />
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={isPending}
                    onClick={() => handleDeleteUser(user.id, user.email)}
                  >
                    删除用户
                  </Button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <InfoRow
                  label="注册时间"
                  value={new Date(user.createdAt).toLocaleString()}
                />
                <InfoRow
                  label="最近登录"
                  value={
                    user.lastLoginAt
                      ? new Date(user.lastLoginAt).toLocaleString()
                      : '尚未登录'
                  }
                />
                <InfoRow
                  label="AI 调用"
                  value={String(user.deepseekCalls)}
                />
                <InfoRow
                  label="存储占用"
                  value={formatBytes(user.storageBytes)}
                />
                <InfoRow
                  label="书籍"
                  value={
                    user.books.length > 0
                      ? user.books
                          .map(
                            (book) =>
                              `${book.title} (${book.fileType}, ${formatBytes(book.fileSize)})`
                          )
                          .join(' / ')
                      : '暂无书籍'
                  }
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm  backdrop-blur-xl">
      <p className="text-sm font-semibold text-foreground">{label}</p>
      <p className="mt-3 break-words text-2xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

function ConfigCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm  backdrop-blur-xl">
      <div>
        <h2 className="text-xl font-bold text-foreground">{title}</h2>
        <p className="mt-2 text-sm text-foreground">{description}</p>
      </div>
      <div className="mt-5">{children}</div>
    </div>
  );
}

function Toggle({
  checked,
  disabled,
  onToggle,
}: {
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={onToggle}
      className={`relative inline-flex h-8 w-16 items-center rounded-full border transition-colors ${
        checked
          ? 'border-primary bg-primary'
          : 'border-border bg-muted'
      }`}
      disabled={disabled}
    >
      <span
        className={`inline-block h-6 w-6 rounded-full bg-card shadow transition-transform ${
          checked ? 'translate-x-9' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

function Badge({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-primary">
      {label}
    </span>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <p className="text-xs uppercase tracking-wide text-foreground">
        {label}
      </p>
      <p className="mt-2 break-all text-sm">{value}</p>
    </div>
  );
}
