'use client';

import React, { useEffect, useState } from 'react';
import api from '@/lib/axios';
import { 
  Plus, 
  Calendar, 
  Lock, 
  Unlock, 
  Wallet, 
  CheckCircle2, 
  AlertCircle,
  FolderOpen
} from 'lucide-react';
import { motion } from 'framer-motion';
import Link from 'next/link';

export default function PeriodsPage() {
  const [periods, setPeriods] = useState<any[]>([]);
  const [activeGroups, setActiveGroups] = useState<any[]>([]);
  const [groupOverrides, setGroupOverrides] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [showOpenModal, setShowOpenModal] = useState(false);

  // Form Fields
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());

  const [modalError, setModalError] = useState('');
  const [modalLoading, setModalLoading] = useState(false);

  const fetchPeriods = () => {
    setLoading(true);
    api.get('/accounting/periods')
      .then(res => setPeriods(res.data?.data || []))
      .catch(e => console.error(e))
      .finally(() => setLoading(false));
  };

  const fetchGroups = async () => {
    try {
      const res = await api.get('/accounting/groups');
      const active = res.data?.data?.filter((g: any) => g.active) || [];
      setActiveGroups(active);
      const defaults: Record<string, number> = {};
      active.forEach((g: any) => {
        defaults[g.id] = g.default_sessions_per_month;
      });
      setGroupOverrides(defaults);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchPeriods();
    fetchGroups();
  }, []);

  const handleOpenMonth = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalLoading(true);
    setModalError('');

    try {
      const overridesArray = Object.keys(groupOverrides).map(groupId => ({
        groupId,
        sessionsCount: groupOverrides[groupId]
      }));

      await api.post('/accounting/periods/open', {
        month: Number(month),
        year: Number(year),
        groupOverrides: overridesArray
      });
      setShowOpenModal(false);
      fetchPeriods();
    } catch (err: any) {
      setModalError(err.response?.data?.error || 'فشل فتح الدورة الشهرية. ربما تم فتح هذا الشهر مسبقاً.');
    } finally {
      setModalLoading(false);
    }
  };

  const handleCloseMonth = async (id: string) => {
    if (!confirm('هل أنت متأكد من رغبتك في إغلاق هذه الدورة المالية بالكامل؟ هذا الإجراء سيقوم بقفل كافة الفواتير الشهرية الخاصة بهذا الشهر ومنع أي تعديل عليها.')) return;
    try {
      await api.post(`/accounting/periods/${id}/close`);
      fetchPeriods();
    } catch (err: any) {
      alert(err.response?.data?.error || 'فشل إغلاق الدورة الشهرية.');
    }
  };

  return (
    <div className="space-y-8 font-cairo" dir="rtl">
      {/* Action Header */}
      <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">الدورات المالية والشهور</h1>
          <p className="text-slate-500 text-sm mt-1">إعداد ومتابعة فواتير الشهور، وفتح وإغلاق الدورات المالية</p>
        </div>
        <button 
          onClick={() => setShowOpenModal(true)} 
          className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-3 rounded-xl font-bold flex items-center gap-2 shadow-md shadow-emerald-500/10 cursor-pointer text-sm"
        >
          <Plus className="w-4.5 h-4.5" />
          <span>فتح دورة شهرية جديدة</span>
        </button>
      </div>

      {/* Monthly Periods List */}
      {loading ? (
        <div className="py-20 text-center space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-emerald-500 border-r-2 mx-auto"></div>
          <p className="text-slate-400 font-bold text-sm">جاري تحميل السجلات الشهرية...</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right divide-y divide-slate-100">
              <thead className="bg-slate-50">
                <tr>
                  <th className="p-4 font-bold text-slate-500 text-xs">الشهر المالي</th>
                  <th className="p-4 font-bold text-slate-500 text-xs">العام</th>
                  <th className="p-4 font-bold text-slate-500 text-xs">تاريخ الإنشاء</th>
                  <th className="p-4 font-bold text-slate-500 text-xs">الحالة</th>
                  <th className="p-4 font-bold text-slate-500 text-xs">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm font-semibold">
                {periods.map((period) => (
                  <tr key={period.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-4 text-slate-900 font-black">
                      <Link href={`/periods/${period.id}`} className="flex items-center gap-2 hover:text-emerald-600 transition-colors cursor-pointer">
                        <FolderOpen className="w-5 h-5 text-emerald-600" />
                        <span>شهر {period.month}</span>
                      </Link>
                    </td>
                    <td className="p-4 text-slate-700 font-bold">{period.year}</td>
                    <td className="p-4 text-slate-400">{new Date(period.created_at).toLocaleDateString('ar-EG')}</td>
                    <td className="p-4">
                      {period.status === 'OPEN' ? (
                        <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-800 border border-emerald-100 px-3 py-1 rounded-full text-xs font-black">
                          <Unlock className="w-3.5 h-3.5" /> مفتوح للتحصيل
                        </span>
                      ) : period.status === 'CLOSED' ? (
                        <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 border border-slate-200 px-3 py-1 rounded-full text-xs font-black">
                          <Lock className="w-3.5 h-3.5" /> دورة مغلقة
                        </span>
                      ) : (
                        <span className="bg-amber-50 text-amber-800 border border-amber-100 px-3 py-1 rounded-full text-xs font-black">مسودة</span>
                      )}
                    </td>
                    <td className="p-4">
                      {period.status === 'OPEN' && (
                        <button
                          onClick={() => handleCloseMonth(period.id)}
                          className="text-xs font-black text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 border border-red-100 px-3.5 py-2 rounded-xl transition-all cursor-pointer"
                        >
                          إغلاق الشهر المالي
                        </button>
                      )}
                      {period.status === 'CLOSED' && (
                        <span className="text-xs text-slate-400 font-bold">دورة مؤرشفة مقفلة</span>
                      )}
                    </td>
                  </tr>
                ))}
                {periods.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-12 text-center text-slate-400 font-bold">
                      لم يتم فتح أي دورات مالية بالنظام المالي حتى الآن.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Open Billing Month Modal */}
      {showOpenModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-6">
            <div className="flex justify-between items-center border-b border-slate-100 pb-4">
              <h2 className="text-xl font-bold text-slate-800">فتح دورة شهرية جديدة</h2>
              <button onClick={() => setShowOpenModal(false)} className="text-slate-400 hover:text-slate-600 font-bold cursor-pointer">✕</button>
            </div>

            {modalError && (
              <div className="bg-red-50 border border-red-100 text-red-800 px-4 py-2.5 rounded-xl flex items-center gap-2.5 text-xs font-bold">
                <AlertCircle className="w-5 h-5 text-red-500" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleOpenMonth} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-2">اختر الشهر المالي</label>
                <select value={month} onChange={e => setMonth(Number(e.target.value))} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold">
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>شهر {m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-2">اختر العام</label>
                <select value={year} onChange={e => setYear(Number(e.target.value))} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold">
                  <option value={new Date().getFullYear()}>{new Date().getFullYear()}</option>
                  <option value={new Date().getFullYear() + 1}>{new Date().getFullYear() + 1}</option>
                  <option value={new Date().getFullYear() - 1}>{new Date().getFullYear() - 1}</option>
                </select>
              </div>

              {activeGroups.length > 0 && (
                <div className="space-y-3 max-h-48 overflow-y-auto pr-2 custom-scrollbar border border-slate-100 rounded-xl p-3 bg-slate-50/50">
                  <label className="block text-xs font-bold text-slate-600 mb-2 border-b border-slate-100 pb-2">عدد حصص المجموعات في هذا الشهر</label>
                  {activeGroups.map(group => (
                    <div key={group.id} className="flex justify-between items-center bg-white p-2.5 rounded-xl border border-slate-100 shadow-sm">
                      <span className="text-sm font-bold text-slate-700">{group.name}</span>
                      <div className="flex items-center gap-2">
                        <input 
                          type="number" 
                          min="1" 
                          value={groupOverrides[group.id] || ''} 
                          onChange={(e) => setGroupOverrides({...groupOverrides, [group.id]: Number(e.target.value)})}
                          className="w-16 px-2 py-1.5 text-center border border-slate-200 rounded-lg text-sm font-bold bg-slate-50 focus:bg-white focus:border-emerald-500 transition-colors outline-none"
                        />
                        <span className="text-xs text-slate-500 font-bold">حصة</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="bg-amber-50 text-amber-800 border border-amber-100 p-4 rounded-2xl text-xs leading-relaxed font-bold">
                💡 **ملاحظة:** سيقوم النظام بإنشاء مطالبات الطلاب بناءً على السعر الافتراضي لكل طالب مضروباً في عدد الحصص المحدد للمجموعة بالأعلى.
              </div>

              <div className="flex gap-4 border-t border-slate-100 pt-4">
                <button type="button" onClick={() => setShowOpenModal(false)} className="flex-1 bg-slate-100 text-slate-700 py-3 rounded-xl font-bold cursor-pointer">إلغاء</button>
                <button type="submit" disabled={modalLoading} className="flex-1 bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-500 disabled:bg-emerald-800 cursor-pointer">
                  {modalLoading ? 'جاري الفتح والإنشاء...' : 'فتح الشهر الآن'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
