'use client';

import React, { useEffect, useState, useCallback } from 'react';
import api from '@/lib/axios';
import { 
  BellRing, 
  MessageSquare, 
  CheckCircle, 
  AlertCircle,
  Copy,
  RefreshCw
} from 'lucide-react';
import { motion } from 'framer-motion';

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [periods, setPeriods] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState('');

  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');

  const fetchAlerts = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/accounting/alerts', {
        params: { periodId: selectedPeriod || undefined }
      });
      setAlerts(res.data?.data || res.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [selectedPeriod]);

  useEffect(() => {
    // Load periods first
    api.get('/accounting/periods').then(res => {
      const fetchedPeriods = res.data?.data || [];
      setPeriods(fetchedPeriods);
      // Select the first active/open period by default
      const openPeriod = fetchedPeriods.find((p: any) => p.status === 'OPEN');
      if (openPeriod) {
        setSelectedPeriod(openPeriod.id);
      } else if (fetchedPeriods.length > 0) {
        setSelectedPeriod(fetchedPeriods[0].id);
      }
    });
  }, []);

  useEffect(() => {
    if (selectedPeriod) {
      fetchAlerts();
    }
  }, [selectedPeriod, fetchAlerts]);

  const handleGenerateAlerts = async () => {
    if (!selectedPeriod) return;
    setActionLoading(true);
    setActionError('');
    try {
      await api.post('/accounting/alerts/generate', { periodId: selectedPeriod });
      fetchAlerts();
    } catch (err: any) {
      setActionError(err.response?.data?.error || 'فشل توليد التنبيهات.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateStatus = async (id: string, status: string) => {
    try {
      await api.patch(`/accounting/alerts/${id}`, { status });
      fetchAlerts();
    } catch (err: any) {
      alert(err.response?.data?.error || 'فشل تحديث حالة التنبيه.');
    }
  };

  const handleCopyMessage = (alertItem: any) => {
    const student = alertItem.student;
    // Calculate due amount
    let dueAmount = 0;
    // Find matching charge for student and period
    student?.charges?.forEach((c: any) => {
      if (c.period_id === alertItem.period_id) {
        dueAmount += Number(c.net_amount || 0);
      }
    });

    const periodStr = periods.find(p => p.id === alertItem.period_id);
    const monthName = periodStr ? `شهر ${periodStr.month} لعام ${periodStr.year}` : 'الشهر الحالي';

    const message = `عزيزي ولي أمر الطالب: ${student.full_name} (${student.code})،
نود تذكيركم بوجود مستحقات مالية متأخرة بقيمة (${dueAmount.toLocaleString('ar-EG')} ج.م) عن دورة ${monthName} لمجموعة د. بكر أحمد.
يرجى المبادرة بالسداد لتجنب تعليق حساب الطالب. شكراً لتفهمكم.`;

    navigator.clipboard.writeText(message);
    alert('تم نسخ رسالة التذكير بنجاح! يمكنك لصقها وإرسالها عبر واتساب الآن.');
  };

  return (
    <div className="space-y-8 font-cairo" dir="rtl">
      {/* Title Header */}
      <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">متابعة المتأخرات والتنبيهات</h1>
          <p className="text-slate-500 text-sm mt-1">توليد تنبيهات الطلاب المتأخرين عن الدفع وتجهيز رسائل المتابعة</p>
        </div>
        <div className="flex gap-3">
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500 text-sm font-semibold"
          >
            <option value="">اختر الدورة المالية</option>
            {periods.map(p => (
              <option key={p.id} value={p.id}>دورة شهر {p.month} / {p.year}</option>
            ))}
          </select>
          <button 
            onClick={handleGenerateAlerts} 
            disabled={actionLoading || !selectedPeriod}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 text-white px-5 py-3 rounded-xl font-bold flex items-center gap-2 shadow-md shadow-emerald-500/10 cursor-pointer text-sm"
          >
            <RefreshCw className={`w-4.5 h-4.5 ${actionLoading ? 'animate-spin' : ''}`} />
            <span>توليد كشوف التنبيهات</span>
          </button>
        </div>
      </div>

      {actionError && (
        <div className="bg-red-50 border border-red-100 text-red-800 px-4 py-3 rounded-xl flex items-center gap-2.5 text-xs font-bold">
          <AlertCircle className="w-5 h-5 text-red-500" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Alerts Listing Table */}
      {loading ? (
        <div className="py-20 text-center space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-emerald-500 border-r-2 mx-auto"></div>
          <p className="text-slate-400 font-bold text-sm">جاري تحميل قائمة التنبيهات...</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="p-4 font-bold text-slate-500 text-xs">كود الطالب</th>
                  <th className="p-4 font-bold text-slate-500 text-xs">اسم الطالب</th>
                  <th className="p-4 font-bold text-slate-500 text-xs">هاتف التواصل</th>
                  <th className="p-4 font-bold text-slate-500 text-xs">حالة التنبيه</th>
                  <th className="p-4 font-bold text-slate-500 text-xs">تاريخ الإنشاء</th>
                  <th className="p-4 font-bold text-slate-500 text-xs">إجراءات المتابعة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-semibold">
                {alerts.map((alertItem) => (
                  <tr key={alertItem.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-4 text-slate-900 font-black">{alertItem.student?.code}</td>
                    <td className="p-4 text-slate-800 font-bold">{alertItem.student?.full_name}</td>
                    <td className="p-4 text-slate-500 font-semibold">
                      {alertItem.student?.guardian_phone || alertItem.student?.student_phone || 'لا يوجد'}
                    </td>
                    <td className="p-4">
                      {alertItem.status === 'OPEN' ? (
                        <span className="bg-red-50 text-red-800 border border-red-100 px-3 py-1 rounded-full text-xs font-black">مستحق للتواصل</span>
                      ) : alertItem.status === 'CONTACTED' ? (
                        <span className="bg-amber-50 text-amber-800 border border-amber-100 px-3 py-1 rounded-full text-xs font-black">تم التواصل</span>
                      ) : (
                        <span className="bg-emerald-50 text-emerald-800 border border-emerald-100 px-3 py-1 rounded-full text-xs font-black">تم الحل</span>
                      )}
                    </td>
                    <td className="p-4 text-slate-400">{new Date(alertItem.created_at).toLocaleDateString('ar-EG')}</td>
                    <td className="p-4 flex gap-2">
                      <button
                        onClick={() => handleCopyMessage(alertItem)}
                        className="inline-flex items-center gap-1.5 text-xs font-black text-emerald-600 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 px-3.5 py-2 rounded-xl transition-all cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" /> نسخ رسالة واتساب
                      </button>

                      {alertItem.status === 'OPEN' && (
                        <button
                          onClick={() => handleUpdateStatus(alertItem.id, 'CONTACTED')}
                          className="text-xs font-black text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-200 px-3.5 py-2 rounded-xl transition-all cursor-pointer"
                        >
                          تحديث: تم الاتصال
                        </button>
                      )}

                      {alertItem.status !== 'RESOLVED' && (
                        <button
                          onClick={() => handleUpdateStatus(alertItem.id, 'RESOLVED')}
                          className="text-xs font-black text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 px-3.5 py-2 rounded-xl transition-all cursor-pointer"
                        >
                          تحديث: تم السداد
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {alerts.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-12 text-center text-slate-400 font-bold">
                      لا توجد متأخرات دفع أو تنبيهات نشطة لهذه الفترة المالية.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
