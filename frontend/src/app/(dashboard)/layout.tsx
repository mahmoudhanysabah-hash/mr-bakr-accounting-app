'use client';

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import api from '@/lib/axios';
import type { AuthUser } from '@/lib/auth';
import { canAccessDashboardPath, extractAuthUser, homeForRole } from '@/lib/auth';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const verifyAuth = async () => {
      try {
        const response = await api.get('/auth/me');
        const currentUser = extractAuthUser(response.data);

        if (!currentUser) {
          throw new Error('Unauthorized role');
        }

        if (!cancelled) {
          setUser(currentUser);
        }
      } catch {
        if (!cancelled) {
          router.replace('/');
        }
      } finally {
        if (!cancelled) {
          setCheckingAuth(false);
        }
      }
    };

    void verifyAuth();

    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!user) {
      return;
    }

    if (!canAccessDashboardPath(user.role, pathname)) {
      router.replace(homeForRole(user.role));
    }
  }, [pathname, router, user]);

  if (checkingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 font-cairo text-white" dir="rtl">
        <div className="ml-3 h-8 w-8 animate-spin rounded-full border-t-2 border-emerald-500" />
        <span>جاري التحقق من الصلاحيات...</span>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const canRenderCurrentPath = canAccessDashboardPath(user.role, pathname);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 font-cairo" dir="rtl">
      <Sidebar userRole={user.role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="z-10 flex h-16 shrink-0 items-center justify-between border-b border-slate-200/80 bg-white px-8">
          <h2 className="text-base font-bold text-slate-800">نظام إدارة الحسابات والتحصيل</h2>
          <div className="flex items-center gap-3">
            <span className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800">
              قسم الحسابات والمالية
            </span>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-8">
          <div className="mx-auto max-w-7xl">{canRenderCurrentPath ? children : null}</div>
        </main>
      </div>
    </div>
  );
}
