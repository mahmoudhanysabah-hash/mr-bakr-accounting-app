'use client';

import React, { useEffect, useState } from 'react';
import api from '@/lib/axios';
import { 
  TrendingUp, 
  Users, 
  AlertCircle, 
  ArrowUpLeft, 
  ArrowDownRight, 
  DollarSign, 
  Calendar,
  Wallet
} from 'lucide-react';
import { motion } from 'framer-motion';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer 
} from 'recharts';

export default function AccountingDashboard() {
  const [studentsCount, setStudentsCount] = useState(0);
  const [groupsCount, setGroupsCount] = useState(0);
  const [periods, setPeriods] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Computations
  const [totalCollected, setTotalCollected] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        setLoading(true);
        
        const res = await api.get('/accounting/dashboard-stats');
        const data = res.data?.data || res.data || {};

        setStudentsCount(data.studentsCount || 0);
        setGroupsCount(data.groupsCount || 0);
        setTotalCollected(data.totalCollected || 0);
        setTotalExpenses(data.totalExpenses || 0);
        setPeriods(data.periods || []);
        setExpenses(data.recentExpenses || []);
        setChartData(data.chartData || []);

      } catch (err) {
        console.error('Failed to load dashboard statistics', err);
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]" dir="rtl">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-emerald-500 border-r-2 mx-auto"></div>
          <p className="text-slate-500 font-bold">جاري تحميل إحصائيات التحصيل المالي...</p>
        </div>
      </div>
    );
  }

  const netProfit = totalCollected - totalExpenses;

  const cards = [
    { 
      title: 'إجمالي التحصيل المالي', 
      value: `${totalCollected.toLocaleString('ar-EG')} ج.م`, 
      icon: <DollarSign className="w-6 h-6 text-emerald-600" />, 
      color: 'border-emerald-200 bg-emerald-50/50', 
      desc: 'إجمالي المدفوعات المؤكدة المستلمة' 
    },
    { 
      title: 'إجمالي المصروفات العامة', 
      value: `${totalExpenses.toLocaleString('ar-EG')} ج.م`, 
      icon: <ArrowDownRight className="w-6 h-6 text-red-600" />, 
      color: 'border-red-200 bg-red-50/50', 
      desc: 'المصروفات التشغيلية والمشتريات' 
    },
    { 
      title: 'صافي الإيرادات التشغيلية', 
      value: `${netProfit.toLocaleString('ar-EG')} ج.م`, 
      icon: <TrendingUp className="w-6 h-6 text-indigo-600" />, 
      color: 'border-indigo-200 bg-indigo-50/50', 
      desc: 'الأرباح بعد خصم كافة المصروفات' 
    },
    { 
      title: 'الطلاب المسجلين بالنظام', 
      value: `${studentsCount.toLocaleString('ar-EG')} طالب`, 
      icon: <Users className="w-6 h-6 text-amber-600" />, 
      color: 'border-amber-200 bg-amber-50/50', 
      desc: 'العدد الكلي للطلاب المتابعين مالياً' 
    },
  ];

  return (
    <div className="space-y-8 font-cairo" dir="rtl">
      {/* Header Title */}
      <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">نظرة عامة على التحصيل</h1>
          <p className="text-slate-500 text-sm mt-1">مرحباً بك في لوحة تحكم الإدارة المالية والتحصيل</p>
        </div>
        <div className="text-sm font-bold text-slate-500 bg-slate-100 px-4 py-2 rounded-xl flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          <span>الدورة المالية الحالية: {new Date().toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' })}</span>
        </div>
      </div>

      {/* Grid Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {cards.map((card, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
            className={`border p-6 rounded-2xl shadow-sm flex flex-col justify-between h-40 transition-all ${card.color}`}
          >
            <div className="flex justify-between items-start">
              <span className="text-sm font-bold text-slate-600">{card.title}</span>
              <div className="p-2.5 bg-white rounded-xl shadow-sm">{card.icon}</div>
            </div>
            <div className="mt-4">
              <span className="text-2xl font-black text-slate-800 tracking-tight">{card.value}</span>
              <p className="text-xs text-slate-400 mt-1 font-semibold">{card.desc}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Chart Section */}
      {chartData.length > 0 && (
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <h3 className="font-bold text-slate-800 text-lg mb-6 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-indigo-600" />
            الإيرادات مقابل المصروفات (آخر 6 أشهر)
          </h3>
          <div className="h-80 w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} dx={-10} />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                <Bar dataKey="income" name="الإيرادات (ج.م)" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={40} />
                <Bar dataKey="expense" name="المصروفات (ج.م)" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Main Grid: Details Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Active Billing Periods */}
        <div className="lg:col-span-2 bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-slate-800 text-lg">الفترات المالية النشطة</h3>
            <span className="text-xs text-slate-400 font-bold">الشهور والدورات المفتوحة</span>
          </div>

          <div className="divide-y divide-slate-100">
            {periods.slice(0, 5).map((period) => (
              <div key={period.id} className="py-4 flex justify-between items-center first:pt-0 last:pb-0">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-slate-50 text-slate-700 rounded-xl">
                    <Wallet className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800 text-sm">
                      دورة شهر {period.month} - لعام {period.year}
                    </h4>
                    <p className="text-xs text-slate-400 mt-0.5 font-medium">تم الإنشاء في {new Date(period.created_at).toLocaleDateString('ar-EG')}</p>
                  </div>
                </div>
                <div>
                  <span className={`px-3 py-1 rounded-full text-xs font-black border ${
                    period.status === 'OPEN' 
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-100' 
                      : period.status === 'CLOSED'
                      ? 'bg-slate-100 text-slate-600 border-slate-200'
                      : 'bg-amber-50 text-amber-800 border-amber-100'
                  }`}>
                    {period.status === 'OPEN' ? 'مفتوح للتحصيل' : period.status === 'CLOSED' ? 'مغلق' : 'مسودة'}
                  </span>
                </div>
              </div>
            ))}
            {periods.length === 0 && (
              <div className="py-12 text-center text-slate-400 font-bold text-sm">
                لم يتم فتح دورات مالية بعد. يمكنك فتح شهور جديدة من قسم التحصيل.
              </div>
            )}
          </div>
        </div>

        {/* Recent Expenses summary */}
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-slate-800 text-lg">المصروفات الأخيرة</h3>
            <span className="text-xs text-red-600 bg-red-50 border border-red-100 px-2.5 py-1 rounded-full font-bold">
              تحديث مباشر
            </span>
          </div>

          <div className="divide-y divide-slate-100">
            {expenses.slice(0, 5).map((expense) => (
              <div key={expense.id} className="py-4 flex justify-between items-center first:pt-0 last:pb-0">
                <div className="space-y-1">
                  <h4 className="font-bold text-slate-800 text-sm">{expense.description}</h4>
                  <span className="inline-block text-xs font-semibold text-slate-400">{expense.category}</span>
                </div>
                <div className="text-left">
                  <span className="font-bold text-red-600 text-sm">-{Number(expense.amount).toLocaleString('ar-EG')} ج.م</span>
                  <p className="text-[10px] text-slate-400 mt-0.5">{new Date(expense.spent_at).toLocaleDateString('ar-EG')}</p>
                </div>
              </div>
            ))}
            {expenses.length === 0 && (
              <div className="py-12 text-center text-slate-400 font-bold text-sm">
                لا توجد مصروفات مسجلة حالياً.
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
