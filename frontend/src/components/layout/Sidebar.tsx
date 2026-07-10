'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import api from '@/lib/axios';
import {
  BarChart3,
  BellRing,
  CalendarCheck,
  ImageUp,
  LayoutDashboard,
  LogOut,
  ReceiptText,
  ShieldCheck,
  UserRound,
  Users,
  WalletCards,
} from 'lucide-react';

export default function Sidebar() {
  const pathname = usePathname();
  const [userRole, setUserRole] = React.useState<string>('');

  React.useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        setUserRole(user.role);
      } catch {
        setUserRole('');
      }
    }
  }, []);

  const links =
    userRole === 'ASSISTANT'
      ? [{ name: 'تشغيل الحصص', href: '/sessions', icon: CalendarCheck }]
      : [
    { name: 'لوحة التحصيل', href: '/dashboard', icon: LayoutDashboard },
    { name: 'شؤون الطلاب', href: '/students', icon: UserRound },
    { name: 'المجموعات الدراسية', href: '/groups', icon: Users },
    { name: 'تشغيل الحصص', href: '/sessions', icon: CalendarCheck },
    { name: 'التحصيل والشهور', href: '/periods', icon: WalletCards },
    { name: 'المصروفات العامة', href: '/expenses', icon: ReceiptText },
    { name: 'متأخرات الدفع', href: '/alerts', icon: BellRing },
    { name: 'التقارير المالية', href: '/reports', icon: BarChart3 },
    { name: 'رفع صورة حسابات', href: '/import', icon: ImageUp },
    ...(userRole === 'ADMIN'
      ? [{ name: 'مستخدمي النظام', href: '/admin/users', icon: ShieldCheck }]
      : []),
  ];

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Keep local cleanup even if the server session is already gone.
    }
    localStorage.removeItem('user');
    window.location.href = '/';
  };

  return (
    <div className="flex h-screen w-64 shrink-0 flex-col border-l border-slate-800 bg-slate-900 text-white" dir="rtl">
      <div className="flex items-center gap-3 border-b border-slate-800 p-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 text-xl font-black text-white shadow-md shadow-emerald-500/20">
          ح
        </div>
        <div>
          <h1 className="font-cairo text-lg font-bold tracking-tight">نظام الحسابات</h1>
          <p className="text-xs text-slate-400">مستر بكر</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-6">
        <ul className="space-y-1.5 px-3">
          {links.map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            const Icon = link.icon;
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={`flex items-center gap-3.5 rounded-xl px-4 py-3.5 text-sm font-semibold transition-all duration-200 ${
                    active
                      ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/10'
                      : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${active ? 'text-white' : 'text-slate-400'}`} />
                  <span>{link.name}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-slate-800 p-4">
        <button
          onClick={handleLogout}
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-slate-800 py-3 text-sm font-bold transition-all duration-200 hover:bg-red-600/90"
        >
          <LogOut className="h-4 w-4" />
          <span>تسجيل الخروج</span>
        </button>
      </div>
    </div>
  );
}
