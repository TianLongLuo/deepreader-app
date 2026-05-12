'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function LoginPage() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [allowRegistrations, setAllowRegistrations] = useState(true);
  const [configLoaded, setConfigLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadConfig = async () => {
      try {
        const res = await fetch('/api/public/app-config');
        const data = (await res.json()) as { allowRegistrations?: boolean };
        if (!cancelled && typeof data.allowRegistrations === 'boolean') {
          setAllowRegistrations(data.allowRegistrations);
          if (!data.allowRegistrations) {
            setIsLogin(true);
          }
        }
      } catch {
        if (!cancelled) {
          setAllowRegistrations(true);
        }
      } finally {
        if (!cancelled) {
          setConfigLoaded(true);
        }
      }
    };

    void loadConfig();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const endpoint = isLogin ? '/api/auth/login' : '/api/auth/signup';
    const body = isLogin ? { email, password } : { email, password, name };

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      router.push('/documents');
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#fff7ed] px-4 py-10 text-slate-900">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(251,191,36,0.35),transparent_28%),radial-gradient(circle_at_85%_15%,rgba(251,146,60,0.28),transparent_30%),radial-gradient(circle_at_50%_95%,rgba(253,186,116,0.36),transparent_35%)]" />
      <div className="absolute left-8 top-10 text-5xl opacity-70">🐾</div>
      <div className="absolute right-10 top-24 rotate-12 text-4xl opacity-60">🐟</div>
      <div className="absolute bottom-16 left-16 -rotate-12 text-4xl opacity-60">🧶</div>
      <div className="absolute bottom-10 right-12 text-5xl opacity-70">🐾</div>

      <Card className="relative z-10 w-full max-w-md overflow-hidden rounded-[2rem] border-amber-200/80 bg-white/85 shadow-2xl shadow-orange-200/60 backdrop-blur-xl">
        <div className="absolute left-8 top-0 h-8 w-12 -translate-y-1/2 rounded-t-full bg-orange-200 shadow-inner" />
        <div className="absolute right-8 top-0 h-8 w-12 -translate-y-1/2 rounded-t-full bg-orange-200 shadow-inner" />
        <div className="absolute -right-8 top-28 h-20 w-20 rounded-full bg-orange-100/70 blur-xl" />
        <div className="absolute -left-8 bottom-20 h-20 w-20 rounded-full bg-amber-100/80 blur-xl" />

        <CardHeader className="space-y-4 pb-5 pt-9 text-center">
          <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full border-4 border-white bg-gradient-to-br from-orange-200 via-amber-100 to-rose-100 text-6xl shadow-lg shadow-orange-100">
            🐱
          </div>
          <div className="space-y-2">
            <CardTitle className="text-4xl font-black tracking-tight text-orange-950">DeepReader</CardTitle>
            <CardDescription className="text-base font-medium text-orange-900/75">
              {isLogin ? 'Welcome back, curious kitten.' : 'Create your cozy reading den.'}
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div className="space-y-2">
                <Input
                  className="h-12 rounded-2xl border-orange-200 bg-orange-50/70 px-4 text-orange-950 placeholder:text-orange-900/45 focus-visible:ring-orange-300"
                  placeholder="Cat name / Full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
            )}
            <div className="space-y-2">
              <Input
                className="h-12 rounded-2xl border-orange-200 bg-orange-50/70 px-4 text-orange-950 placeholder:text-orange-900/45 focus-visible:ring-orange-300"
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Input
                className="h-12 rounded-2xl border-orange-200 bg-orange-50/70 px-4 text-orange-950 placeholder:text-orange-900/45 focus-visible:ring-orange-300"
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-600">
                {error}
              </div>
            )}
            <Button
              className="h-12 w-full rounded-2xl bg-orange-500 text-lg font-bold text-white shadow-lg shadow-orange-200 transition-transform hover:-translate-y-0.5 hover:bg-orange-600"
              type="submit"
              disabled={loading}
            >
              {loading ? 'Purring...' : isLogin ? 'Meow in' : 'Join the den'}
            </Button>
          </form>
        </CardContent>

        <CardFooter className="flex flex-col gap-3 pb-8 pt-2 text-center">
          <div className="text-sm text-orange-900/55">Curl up with a book and keep reading.</div>
          {configLoaded && allowRegistrations ? (
            <button
              type="button"
              className="rounded-full px-4 py-2 text-sm font-semibold text-orange-700 transition-colors hover:bg-orange-100 hover:text-orange-900"
              onClick={() => setIsLogin(!isLogin)}
            >
              {isLogin ? "New kitten here? Sign up" : 'Already have an account? Sign in'}
            </button>
          ) : (
            <p className="text-sm text-orange-900/55">Registration is currently closed.</p>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
