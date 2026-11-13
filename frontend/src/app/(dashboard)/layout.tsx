'use client';

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import api from '@/lib/axios';
import type { AuthUser } from '@/lib/auth';
import { canAccessDashboardPath, extractAuthUser, homeForRole } from '@/lib/auth';
import { DashboardUserContext } from '@/lib/dashboard-user';

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
  const isTeachingPage = pathname === '/sessions' || pathname.startsWith('/sessions/');
  const compactOnSmallScreens = isTeachingPage || /^\/(students|groups)(\/|$)/.test(pathname);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 font-cairo print:block print:h-auto print:overflow-visible print:bg-white" dir="rtl">
      <Sidebar userRole={user.role} compactOnSmallScreens={compactOnSmallScreens} />
      <div className="flex min-w-0 flex-1 flex-col print:block">
        <header className={`z-10 flex h-16 shrink-0 items-center justify-between border-b border-slate-200/80 bg-white print:hidden ${compactOnSmallScreens ? 'px-3 sm:px-8' : 'px-8'}`}>
          <h2 className="text-base font-bold text-slate-800">نظام إدارة الحسابات والتحصيل</h2>
          <div className={`items-center gap-3 ${compactOnSmallScreens ? 'hidden sm:flex' : 'flex'}`}>
            <span className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800">
              قسم الحسابات والمالية
            </span>
          </div>
        </header>
        <main className={`flex-1 overflow-y-auto print:overflow-visible print:p-0 ${compactOnSmallScreens ? 'p-3 sm:p-8' : 'p-8'}`}>
          <div className="mx-auto max-w-7xl">
            <DashboardUserContext.Provider value={user}>{canRenderCurrentPath ? children : null}</DashboardUserContext.Provider>
          </div>
        </main>
      </div>
    </div>
  );
}
