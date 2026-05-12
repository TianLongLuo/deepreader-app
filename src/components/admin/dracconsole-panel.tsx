'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type ConsoleSnapshot = {
  adminConfig: {
    allowRegistrations: boolean;
    globalAiProvider: 'deepseek' | 'gemini';
    shareGlobalDeepSeekWithUsers: boolean;
    allowUserAiSettings: boolean;
    hasGlobalDeepseekApiKey: boolean;
    globalDeepseekApiKeyPreview: string | null;
    hasGlobalGeminiApiKey: boolean;
    globalGeminiApiKeyPreview: string | null;
    globalGeminiModel: string;
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
    passwordHash: string;
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
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');

  const handleConfigUpdate = (
    update: {
      allowRegistrations?: boolean;
      globalAiProvider?: 'deepseek' | 'gemini';
      shareGlobalDeepSeekWithUsers?: boolean;
      allowUserAiSettings?: boolean;
      globalDeepseekApiKey?: string;
      clearGlobalDeepseekApiKey?: boolean;
      globalGeminiApiKey?: string;
      clearGlobalGeminiApiKey?: boolean;
      globalGeminiModel?: string;
    },
    fallbackError: string,
    afterSuccess?: () => void
  ) => {
    setError('');

    startTransition(() => {
      void (async () => {
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
      })();
    });
  };

  const handleDeleteUser = (userId: string, email: string) => {
    const confirmed = window.confirm(
      `Delete user ${email} and all of their books, sessions, AI settings, and workspace data?`
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
              : 'Failed to delete user'
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
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <StatCard
          label="Registered Users"
          value={String(snapshot.totals.registeredUsers)}
        />
        <StatCard
          label="AI Calls"
          value={String(snapshot.totals.deepseekCalls)}
        />
        <StatCard label="Books" value={String(snapshot.totals.books)} />
        <StatCard
          label="Registration"
          value={snapshot.adminConfig.allowRegistrations ? 'Open' : 'Closed'}
        />
        <StatCard
          label="Active AI"
          value={snapshot.adminConfig.globalAiProvider === 'gemini' ? 'Gemini' : 'DeepSeek'}
        />
        <StatCard
          label="User AI Settings"
          value={
            snapshot.adminConfig.allowUserAiSettings ? 'Enabled' : 'Disabled'
          }
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <ConfigCard
          title="Registration Switch"
          description="Close registration to hide sign up on the login page and block the signup API."
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
                  'Failed to update registration switch'
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
                  'Failed to update registration switch'
                )
              }
            >
              {snapshot.adminConfig.allowRegistrations
                ? 'Close Sign Up'
                : 'Open Sign Up'}
            </Button>
          </div>
        </ConfigCard>

        <ConfigCard
          title="Shared Global AI"
          description="Choose which shared AI provider all accounts use. The selected global key overrides per-user AI settings when shared AI is enabled."
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-orange-900/65">
                Active Shared Provider
              </label>
              <select
                value={snapshot.adminConfig.globalAiProvider}
                onChange={(event) =>
                  handleConfigUpdate(
                    {
                      globalAiProvider: event.target.value as
                        | 'deepseek'
                        | 'gemini',
                    },
                    'Failed to update active shared AI provider'
                  )
                }
                disabled={isPending}
                className="h-11 w-full rounded-2xl border border-orange-200 bg-orange-50/70 px-4 text-sm text-orange-950"
              >
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
                    'Failed to update shared AI switch'
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
                    'Failed to update shared AI switch'
                  )
                }
              >
                {snapshot.adminConfig.shareGlobalDeepSeekWithUsers
                  ? 'Disable Shared AI'
                  : 'Enable Shared AI'}
              </Button>
            </div>

            <div className="space-y-2 border-t border-orange-200/70 pt-4">
              <label className="text-sm font-semibold text-orange-900/65">
                Global DeepSeek API Key
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
              <p className="text-xs text-orange-900/50">
                {snapshot.adminConfig.hasGlobalDeepseekApiKey
                  ? `Saved key: ${snapshot.adminConfig.globalDeepseekApiKeyPreview}`
                  : 'No global DeepSeek key saved yet.'}
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
                    'Failed to save global DeepSeek API key',
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
                    'Failed to clear global DeepSeek API key',
                    () => setGlobalDeepseekApiKeyDraft('')
                  )
                }
              >
                Clear DeepSeek Key
              </Button>
            </div>

            <div className="space-y-2 border-t border-orange-200/70 pt-4">
              <label className="text-sm font-semibold text-orange-900/65">
                Global Gemini Model
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
              <label className="text-sm font-semibold text-orange-900/65">
                Global Gemini API Key
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
              <p className="text-xs text-orange-900/50">
                {snapshot.adminConfig.hasGlobalGeminiApiKey
                  ? `Saved key: ${snapshot.adminConfig.globalGeminiApiKeyPreview}`
                  : 'No global Gemini key saved yet.'}
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
                    'Failed to save global Gemini settings',
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
                    'Failed to clear global Gemini API key',
                    () => setGlobalGeminiApiKeyDraft('')
                  )
                }
              >
                Clear Gemini Key
              </Button>
            </div>
          </div>
        </ConfigCard>

        <ConfigCard
          title="User AI Settings"
          description="When enabled, all users can see the AI Settings page in the sidebar and save their own API keys."
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
                  'Failed to update user AI settings switch'
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
                  'Failed to update user AI settings switch'
                )
              }
            >
              {snapshot.adminConfig.allowUserAiSettings
                ? 'Disable User AI Settings'
                : 'Enable User AI Settings'}
            </Button>
          </div>
          <p className="mt-4 text-xs text-orange-900/50">
            If shared global AI is on, the saved global key still takes priority.
            If both switches are off, only `admin@qq.com` can use AI features.
          </p>
        </ConfigCard>
      </div>

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : null}

      <div className="rounded-[2rem] border border-orange-200/80 bg-white/80 p-6 shadow-xl shadow-orange-200/35 backdrop-blur-xl">
        <h2 className="text-xl font-bold text-orange-950">🐾 Latest Login</h2>
        <p className="mt-2 text-sm text-orange-900/55">
          {snapshot.latestLogin
            ? `${snapshot.latestLogin.name || 'Unnamed user'} (${snapshot.latestLogin.email}) at ${new Date(snapshot.latestLogin.at).toLocaleString()}`
            : 'No login record yet'}
        </p>
      </div>

      <div className="rounded-[2rem] border border-orange-200/80 bg-white/80 p-6 shadow-xl shadow-orange-200/35 backdrop-blur-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-orange-950">🐱 Users</h2>
            <p className="mt-2 text-sm text-orange-900/55">
              Passwords are stored as one-way hashes only. Plaintext passwords
              cannot be recovered and are not shown here.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4">
          {snapshot.users.map((user) => (
            <div
              key={user.id}
              className="rounded-2xl border border-orange-200/70 bg-orange-50/60 p-5"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h3 className="text-lg font-semibold">
                    {user.name || 'Unnamed user'}
                  </h3>
                  <p className="text-sm text-orange-900/55">{user.email}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge label={user.role} />
                  <Badge label={`${user.deepseekCalls} AI calls`} />
                  <Badge label={`${user.books.length} books`} />
                  <Badge label={`${formatBytes(user.storageBytes)} storage`} />
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={isPending}
                    onClick={() => handleDeleteUser(user.id, user.email)}
                  >
                    Delete User
                  </Button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <InfoRow
                  label="Registered"
                  value={new Date(user.createdAt).toLocaleString()}
                />
                <InfoRow
                  label="Last Login"
                  value={
                    user.lastLoginAt
                      ? new Date(user.lastLoginAt).toLocaleString()
                      : 'Never'
                  }
                />
                <InfoRow label="Password Hash" value={user.passwordHash} />
                <InfoRow
                  label="AI Calls"
                  value={String(user.deepseekCalls)}
                />
                <InfoRow
                  label="Storage Used"
                  value={formatBytes(user.storageBytes)}
                />
                <InfoRow
                  label="Books"
                  value={
                    user.books.length > 0
                      ? user.books
                          .map(
                            (book) =>
                              `${book.title} (${book.fileType}, ${formatBytes(book.fileSize)})`
                          )
                          .join(' / ')
                      : 'No books yet'
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
    <div className="rounded-[2rem] border border-orange-200/80 bg-white/80 p-5 shadow-xl shadow-orange-200/35 backdrop-blur-xl">
      <p className="text-sm font-semibold text-orange-900/55">{label}</p>
      <p className="mt-3 break-words text-2xl font-black text-orange-950 xl:text-3xl">{value}</p>
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
    <div className="rounded-[2rem] border border-orange-200/80 bg-white/80 p-6 shadow-xl shadow-orange-200/35 backdrop-blur-xl">
      <div>
        <h2 className="text-xl font-bold text-orange-950">{title}</h2>
        <p className="mt-2 text-sm text-orange-900/55">{description}</p>
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
          ? 'border-orange-400 bg-orange-400/80'
          : 'border-orange-200 bg-orange-100'
      }`}
      disabled={disabled}
    >
      <span
        className={`inline-block h-6 w-6 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-9' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

function Badge({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-medium text-orange-700">
      {label}
    </span>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-orange-200/70 bg-white/60 p-3">
      <p className="text-xs uppercase tracking-wide text-orange-900/45">
        {label}
      </p>
      <p className="mt-2 break-all text-sm">{value}</p>
    </div>
  );
}
