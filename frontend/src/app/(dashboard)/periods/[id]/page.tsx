'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/axios';
import { 
  ArrowRight, 
  Wallet, 
  Users, 
  Calendar,
  AlertCircle,
  FileText
} from 'lucide-react';
import { motion } from 'framer-motion';
import Link from 'next/link';

export default function PeriodDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const unwrappedParams = React.use(params);
  const { id } = unwrappedParams;

  const [period, setPeriod] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    api.get(`/accounting/periods/${id}`)
      .then(res => setPeriod(res.data?.data || res.data))
      .catch(err => setError('فشل تحميل تفاصيل الدورة المالية'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="py-20 text-center space-y-4">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-emerald-500 border-r-2 mx-auto"></div>
        <p className="text-slate-400 font-bold text-sm">جاري تحميل تفاصيل الشهر المالي...</p>
      </div>
    );
  }

  if (error || !period) {
    return (
      <div className="bg-red-50 text-red-600 p-6 rounded-2xl text-center font-bold font-cairo">
        {error || 'لم يتم العثور على الدورة المالية'}
      </div>
    );
  }

  return (
    <div className="space-y-8 font-cairo" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-4 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
        <button onClick={() => router.push('/periods')} className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl cursor-pointer">
          <ArrowRight className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Calendar className="w-6 h-6 text-emerald-600" />
            شهر {period.month} لسنة {period.year}
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            الحالة: <span className="font-bold text-slate-700">{period.status === 'OPEN' ? 'مفتوح للتحصيل' : 'مغلق'}</span>
          </p>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center shrink-0">
            <FileText className="w-7 h-7 text-slate-600" />
          </div>
          <div>
            <p className="text-slate-500 text-sm font-bold mb-1">إجمالي المستحق</p>
            <h3 className="text-2xl font-black text-slate-800">{period.totals?.due || 0} ج.م</h3>
          </div>
        </div>

        <div className="bg-emerald-50 p-6 rounded-3xl border border-emerald-100 shadow-sm flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-white flex items-center justify-center shrink-0 shadow-sm">
            <Wallet className="w-7 h-7 text-emerald-600" />
          </div>
          <div>
            <p className="text-emerald-700 text-sm font-bold mb-1">إجمالي المحصل</p>
            <h3 className="text-2xl font-black text-emerald-800">{period.totals?.paid || 0} ج.م</h3>
          </div>
        </div>

        <div className="bg-amber-50 p-6 rounded-3xl border border-amber-100 shadow-sm flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-white flex items-center justify-center shrink-0 shadow-sm">
            <AlertCircle className="w-7 h-7 text-amber-600" />
          </div>
          <div>
            <p className="text-amber-700 text-sm font-bold mb-1">الباقي (لم يُحصل)</p>
            <h3 className="text-2xl font-black text-amber-800">{period.totals?.balance || 0} ج.م</h3>
          </div>
        </div>
      </div>

      {/* Charges Table */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-600" />
            فواتير الطلاب لهذا الشهر
          </h2>
          <span className="bg-slate-100 text-slate-700 px-3 py-1 rounded-lg text-sm font-bold">
            {period.charges?.length || 0} فاتورة
          </span>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-right divide-y divide-slate-100">
            <thead className="bg-slate-50">
              <tr>
                <th className="p-4 font-bold text-slate-500 text-xs">اسم الطالب</th>
                <th className="p-4 font-bold text-slate-500 text-xs">المجموعة</th>
                <th className="p-4 font-bold text-slate-500 text-xs">قيمة الفاتورة</th>
                <th className="p-4 font-bold text-slate-500 text-xs">المدفوع</th>
                <th className="p-4 font-bold text-slate-500 text-xs">المتبقي</th>
                <th className="p-4 font-bold text-slate-500 text-xs">حالة السداد</th>
                <th className="p-4 font-bold text-slate-500 text-xs text-left">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm font-semibold">
              {period.charges?.map((charge: any) => (
                <tr key={charge.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-4 text-slate-900 font-bold">{charge.student?.full_name}</td>
                  <td className="p-4 text-slate-600">{charge.group?.name}</td>
                  <td className="p-4 text-slate-700">{charge.net_amount} ج.م</td>
                  <td className="p-4 text-emerald-600 font-black">{charge.paid_amount} ج.م</td>
                  <td className="p-4 text-amber-600 font-black">{charge.balance} ج.م</td>
                  <td className="p-4">
                    {charge.status === 'PAID' ? (
                      <span className="bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-md text-xs font-black">خالص</span>
                    ) : charge.status === 'PARTIALLY_PAID' ? (
                      <span className="bg-amber-50 text-amber-700 px-2.5 py-1 rounded-md text-xs font-black">دفع جزء</span>
                    ) : (
                      <span className="bg-red-50 text-red-700 px-2.5 py-1 rounded-md text-xs font-black">غير مدفوع</span>
                    )}
                  </td>
                  <td className="p-4 text-left">
                    <Link href={`/students/${charge.student_id}`} className="text-emerald-600 hover:text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                      دفع / ملف الطالب
                    </Link>
                  </td>
                </tr>
              ))}
              {(!period.charges || period.charges.length === 0) && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500 font-bold">لا يوجد فواتير مسجلة في هذا الشهر</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
