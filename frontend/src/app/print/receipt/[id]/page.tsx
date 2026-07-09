'use client';

import React, { useEffect, useState } from 'react';
import api from '@/lib/axios';

export default function ReceiptPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const unwrappedParams = React.use(params);
  const { id } = unwrappedParams;
  const [payment, setPayment] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPayment = async () => {
      try {
        const res = await api.get(`/accounting/payments/${id}`);
        setPayment(res.data.data || res.data); // Handle double-wrapping fix
        setTimeout(() => {
          window.print();
        }, 500);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchPayment();
  }, [id]);

  if (loading) {
    return <div className="p-8 text-center text-slate-500 font-bold">جاري تجهيز الإيصال...</div>;
  }

  if (!payment) {
    return <div className="p-8 text-center text-red-500 font-bold">تعذر جلب بيانات الإيصال.</div>;
  }

  return (
    <div className="max-w-3xl mx-auto p-12 bg-white text-slate-800 border-2 border-slate-100 my-8 shadow-sm">
      {/* Header */}
      <div className="flex justify-between items-start border-b-2 border-slate-800 pb-6 mb-8">
        <div>
          <h1 className="text-3xl font-black text-slate-900 mb-2">إيصال استلام نقدية</h1>
          <p className="text-sm font-bold text-slate-500">رقم الإيصال: {payment.id.split('-')[0].toUpperCase()}</p>
        </div>
        <div className="text-left">
          <div className="w-12 h-12 rounded-xl bg-slate-900 flex items-center justify-center text-white font-black text-2xl mr-auto mb-2">
            ح
          </div>
          <p className="font-bold text-slate-800 text-lg">د. بكر أحمد</p>
          <p className="text-sm text-slate-500">نظام الحسابات والتحصيل</p>
        </div>
      </div>

      {/* Details */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <p className="text-lg">
            <span className="font-bold text-slate-500 w-32 inline-block">التاريخ:</span>
            <span className="font-bold">{new Date(payment.paid_at).toLocaleDateString('ar-EG')}</span>
          </p>
          <p className="text-lg text-left">
            <span className="font-bold text-slate-500 w-32 inline-block text-right pr-4">الوقت:</span>
            <span className="font-bold">{new Date(payment.paid_at).toLocaleTimeString('ar-EG')}</span>
          </p>
        </div>

        <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
          <p className="text-2xl mb-4">
            <span className="font-bold text-slate-500 w-40 inline-block">استلمنا من الطالب:</span>
            <span className="font-black text-emerald-800">{payment.student?.full_name}</span>
          </p>
          <p className="text-2xl">
            <span className="font-bold text-slate-500 w-40 inline-block">مبلغ وقدره:</span>
            <span className="font-black text-emerald-800">{Number(payment.amount).toLocaleString()} ج.م</span>
          </p>
        </div>

        <div>
          <p className="text-lg">
            <span className="font-bold text-slate-500 w-32 inline-block">طريقة الدفع:</span>
            <span className="font-bold">{payment.method === 'CASH' ? 'نقدي (Cash)' : payment.method}</span>
          </p>
        </div>

        {payment.allocations && payment.allocations.length > 0 && (
          <div className="mt-8">
            <h3 className="font-bold text-slate-800 text-lg mb-4 border-b pb-2">تفاصيل الفواتير المسددة:</h3>
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-slate-100 border-y border-slate-200">
                  <th className="py-3 px-4 font-bold text-slate-600">المجموعة</th>
                  <th className="py-3 px-4 font-bold text-slate-600">الشهر المالي</th>
                  <th className="py-3 px-4 font-bold text-slate-600">المبلغ المسدد</th>
                </tr>
              </thead>
              <tbody>
                {payment.allocations.map((alloc: any, idx: number) => (
                  <tr key={idx} className="border-b border-slate-100">
                    <td className="py-3 px-4 font-bold text-slate-800">{alloc.charge?.group?.name}</td>
                    <td className="py-3 px-4 font-bold text-slate-800">
                      {alloc.charge?.period?.month} / {alloc.charge?.period?.year}
                    </td>
                    <td className="py-3 px-4 font-black text-emerald-700">{Number(alloc.amount).toLocaleString()} ج.م</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-16 pt-8 border-t-2 border-slate-800 flex justify-between items-end">
        <div>
          <p className="text-sm font-bold text-slate-400">توقيع المستلم</p>
          <p className="mt-4 text-slate-800 font-bold">.........................</p>
        </div>
        <div className="text-left text-sm text-slate-500 font-medium">
          <p>أُصدر هذا الإيصال إلكترونياً من نظام الحسابات.</p>
          <p>لا يُعتد بهذا الإيصال بدون توقيع المسئول المالي.</p>
        </div>
      </div>
      
      {/* Print Instructions - hidden when printing */}
      <div className="mt-8 text-center print:hidden">
        <button 
          onClick={() => window.print()} 
          className="bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-3 rounded-xl font-bold transition-all shadow-md cursor-pointer"
        >
          طباعة الآن
        </button>
        <p className="text-slate-400 text-sm mt-4 font-medium">للعودة إلى الصفحة السابقة، قم بإغلاق هذه النافذة.</p>
      </div>
    </div>
  );
}
