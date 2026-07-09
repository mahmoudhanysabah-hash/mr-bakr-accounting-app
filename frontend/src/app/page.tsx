'use client';

import React, { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Lock, Mail } from 'lucide-react';
import api from '@/lib/axios';

const allowedRoles = ['ADMIN', 'ACCOUNTANT', 'FINANCE_MANAGER'];

function getErrorMessage(error: unknown) {
  const response = (error as { response?: { data?: { error?: string; message?: string | string[] } } }).response;
  const message = response?.data?.message;
  if (response?.data?.error) return response.data.error;
  if (Array.isArray(message)) return message.join('، ');
  if (message) return message;
  return 'فشل تسجيل الدخول. تأكد من البريد وكلمة السر.';
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        if (allowedRoles.includes(user.role)) {
          router.push('/dashboard');
          return;
        }
      } catch {
        localStorage.clear();
      }
    }
    setChecking(false);
  }, [router]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await api.post('/auth/login', { email, password });
      const user = response.data?.data?.user;
      if (!user || !allowedRoles.includes(user.role)) {
        setError('هذا الحساب غير مصرح له بدخول نظام الحسابات.');
        return;
      }

      localStorage.setItem('user', JSON.stringify(user));
      router.push('/dashboard');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 font-cairo text-white" dir="rtl">
        <div className="ml-3 h-8 w-8 animate-spin rounded-full border-t-2 border-emerald-500" />
        <span>جاري التحقق من الجلسة...</span>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 font-cairo" dir="rtl">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-600 text-3xl font-black text-white shadow-lg shadow-emerald-500/20">
            ح
          </div>
          <h1 className="text-3xl font-black text-white">نظام الإدارة المالية</h1>
          <p className="mt-2 text-sm font-semibold text-slate-400">لوحة تحصيل وحسابات مستر بكر</p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl sm:p-8">
          {error && (
            <div className="mb-6 flex items-center gap-3 rounded-xl border border-red-800/80 bg-red-950/50 px-4 py-3.5 text-sm font-semibold text-red-200">
              <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          <form className="space-y-5" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-slate-300">البريد الإلكتروني</span>
              <div className="relative">
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  dir="ltr"
                  placeholder="admin@example.com"
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 py-3.5 pl-4 pr-11 font-medium text-white outline-none transition focus:border-emerald-500"
                />
                <Mail className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
              </div>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-bold text-slate-300">كلمة السر</span>
              <div className="relative">
                <input
                  required
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  dir="ltr"
                  placeholder="********"
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 py-3.5 pl-4 pr-11 font-medium text-white outline-none transition focus:border-emerald-500"
                />
                <Lock className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
              </div>
            </label>

            <button
              disabled={loading}
              className="flex w-full justify-center rounded-xl bg-emerald-600 px-4 py-4 text-lg font-bold text-white shadow-lg shadow-emerald-500/10 transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-800"
            >
              {loading ? 'جاري تسجيل الدخول...' : 'تسجيل الدخول'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
