'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function LoginPage() {
  const router = useRouter();
  const [showPassword,setShowPassword]=useState(false);
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

      router.push(data.user?.role === 'ADMIN' ? '/dracconsole' : '/documents');
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };


  return <main className="flex min-h-screen items-center justify-center bg-background px-5 py-12">
    <div className="w-full max-w-[360px]">
      <div className="mb-10"><p className="mb-7 text-sm font-semibold tracking-tight">DeepReader</p><h1 className="text-3xl font-semibold tracking-tight">{isLogin?'回到阅读。':'从阅读开始。'}</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">{isLogin?'登录你的书库，接着上次的地方读下去。':'创建账户后即可使用，无需等待审核。'}</p></div>
      <form onSubmit={handleSubmit} className="space-y-4">
        {!isLogin&&<label className="block text-sm">姓名<Input className="mt-2" autoComplete="name" value={name} onChange={e=>setName(e.target.value)} required/></label>}
        <label className="block text-sm">{isLogin?'邮箱或管理员账号':'邮箱'}<Input className="mt-2" type={isLogin?'text':'email'} autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required/></label>
        <label className="block text-sm">密码<div className="relative mt-2"><Input className="pr-16" type={showPassword?'text':'password'} minLength={isLogin?1:8} maxLength={isLogin?undefined:72} autoComplete={isLogin?'current-password':'new-password'} value={password} onChange={e=>setPassword(e.target.value)} required/><button type="button" aria-label={showPassword?'隐藏密码':'显示密码'} className="absolute right-3 top-3 text-xs text-muted-foreground" onClick={()=>setShowPassword(v=>!v)}>{showPassword?'隐藏':'显示'}</button></div></label>
        {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button className="mt-2 w-full" disabled={loading}>{loading?'处理中…':isLogin?'登录':'创建账户'}</Button>
      </form>
      {configLoaded&&allowRegistrations&&<button type="button" className="mt-6 w-full text-center text-sm text-primary" onClick={()=>{setIsLogin(!isLogin);setError('');}}>{isLogin?'还没有账户？注册':'已有账户？登录'}</button>}
      <p className="mt-12 text-center text-xs text-muted-foreground">Read with understanding.</p>
    </div>
  </main>;
}
