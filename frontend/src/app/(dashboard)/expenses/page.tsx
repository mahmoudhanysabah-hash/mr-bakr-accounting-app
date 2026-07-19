'use client';

import React, { useEffect, useState, useCallback } from 'react';
import api from '@/lib/axios';
import { getApiErrorMessage } from '@/lib/error';
import { getBackendBaseUrl } from '@/lib/backend-url';
import { 
  Plus, 
  FileText, 
  DollarSign, 
  Filter, 
  AlertCircle,
  FileDown
} from 'lucide-react';
import { motion } from 'framer-motion';

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  // Filters
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth() + 1);
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());

  // Form Fields
  const [category, setCategory] = useState('أدوات مكتبية');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CASH');
  const [description, setDescription] = useState('');
  const [spentAt, setSpentAt] = useState(new Date().toISOString().split('T')[0]);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  const [modalError, setModalError] = useState('');
  const [modalLoading, setModalLoading] = useState(false);

  const fetchExpenses = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/accounting/expenses', {
        params: { month: filterMonth, year: filterYear }
      });
      setExpenses(res.data?.data || res.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [filterMonth, filterYear]);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  const handleExportCSV = () => {
    if (expenses.length === 0) return;
    
    const data = expenses.map(e => ({
      "المبلغ (ج.م)": Number(e.amount),
      "طريقة الدفع": e.method === 'CASH' ? 'نقدي' : e.method === 'BANK_TRANSFER' ? 'تحويل بنكي' : 'محفظة إلكترونية',
      "التصنيف": e.category,
      "الوصف": e.description || 'لا يوجد',
      "التاريخ": new Date(e.spent_at).toLocaleDateString('ar-EG'),
      "الحالة": e.status === 'APPROVED' ? 'معتمد' : e.status === 'REJECTED' ? 'مرفوض' : 'قيد المراجعة',
      "تم الإضافة بواسطة": e.created_by?.full_name || 'مدير النظام'
    }));

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
      + Object.keys(data[0]).join(",") + "\n"
      + data.map(row => Object.values(row).join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `سجل_مصروفات_شهر_${filterMonth}_${filterYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalLoading(true);
    setModalError('');

    try {
      // 1. Log Expense
      const expRes = await api.post('/accounting/expenses', {
        category,
        amount: Number(amount),
        method,
        spentAt: new Date(spentAt).toISOString(),
        description
      });

      const expenseId = expRes.data?.data?.id || expRes.data?.id;

      // 2. Upload receipt if attached
      if (expenseId && receiptFile) {
        const formData = new FormData();
        formData.append('file', receiptFile);
        await api.post(`/accounting/expenses/${expenseId}/receipt`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      }

      setShowAddModal(false);
      setAmount('');
      setDescription('');
      setReceiptFile(null);
      fetchExpenses();
    } catch (err: any) {
      setModalError(getApiErrorMessage(err, 'فشل تسجيل المصروفات.'));
    } finally {
      setModalLoading(false);
    }
  };

  // Calculate total spent in filter period
  let totalSpent = 0;
  expenses.forEach((e: any) => {
    totalSpent += Number(e.amount || 0);
  });

  return (
    <div className="space-y-8 font-cairo" dir="rtl">
      {/* Action Header */}
      <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">إدارة المصروفات التشغيلية</h1>
          <p className="text-slate-500 text-sm mt-1">عرض وتسجيل المصروفات العامة، الإيجارات، والأدوات المكتبية</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={handleExportCSV}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-5 py-3 rounded-xl font-bold flex items-center gap-2 cursor-pointer text-sm transition-colors"
          >
            <FileDown className="w-4.5 h-4.5" />
            <span>تصدير إلى Excel</span>
          </button>
          <button 
            onClick={() => setShowAddModal(true)} 
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-3 rounded-xl font-bold flex items-center gap-2 shadow-md shadow-emerald-500/10 cursor-pointer text-sm"
          >
            <Plus className="w-4.5 h-4.5" />
            <span>تسجيل مصروف جديد</span>
          </button>
        </div>
      </div>

      {/* Stats Summary & Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Filter Cards Month/Year */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm md:col-span-2 flex flex-col md:flex-row items-center gap-4 justify-between">
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-slate-400" />
            <h3 className="font-bold text-slate-700 text-sm">فلترة المصروفات حسب الفترة</h3>
          </div>
          <div className="flex gap-3">
            <select
              value={filterMonth}
              onChange={(e) => setFilterMonth(Number(e.target.value))}
              className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500 text-xs font-bold"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>شهر {m}</option>
              ))}
            </select>
            <select
              value={filterYear}
              onChange={(e) => setFilterYear(Number(e.target.value))}
              className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500 text-xs font-bold"
            >
              <option value={new Date().getFullYear()}>{new Date().getFullYear()}</option>
              <option value={new Date().getFullYear() - 1}>{new Date().getFullYear() - 1}</option>
            </select>
          </div>
        </div>

        {/* Aggregate sum card */}
        <div className="bg-red-50/50 border border-red-200 p-6 rounded-2xl flex flex-col justify-between h-28">
          <span className="text-xs font-bold text-slate-500">إجمالي مصروفات الفترة المحددة</span>
          <span className="text-2xl font-black text-red-600 mt-2">{totalSpent.toLocaleString('ar-EG')} ج.م</span>
        </div>
      </div>

      {/* Expenses Table */}
      {loading ? (
        <div className="py-20 text-center space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-emerald-500 border-r-2 mx-auto"></div>
          <p className="text-slate-400 font-bold text-sm">جاري تحميل كشوف المصروفات...</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="p-4 font-bold text-slate-500 text-xs">التاريخ</th>
                  <th className="p-4 font-bold text-slate-500 text-xs">التصنيف</th>
                  <th className="p-4 font-bold text-slate-500 text-xs">المبلغ المصروف</th>
                  <th className="p-4 font-bold text-slate-500 text-xs">البيان / الوصف</th>
                  <th className="p-4 font-bold text-slate-500 text-xs">طريقة الدفع</th>
                  <th className="p-4 font-bold text-slate-500 text-xs">إثبات الصرف</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-semibold">
                {expenses.map((expense) => (
                  <tr key={expense.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-4 text-slate-400">{new Date(expense.spent_at).toLocaleDateString('ar-EG')}</td>
                    <td className="p-4">
                      <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-xl text-xs font-black">
                        {expense.category}
                      </span>
                    </td>
                    <td className="p-4 text-red-600 font-black">-{Number(expense.amount).toLocaleString('ar-EG')} ج.م</td>
                    <td className="p-4 text-slate-800 font-bold">{expense.description}</td>
                    <td className="p-4 text-slate-500">{expense.method}</td>
                    <td className="p-4">
                      {expense.receipt_storage_key ? (
                        <a
                          href={`${getBackendBaseUrl()}/accounting/expenses/receipts/${expense.receipt_storage_key}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs text-indigo-600 bg-indigo-50 border border-indigo-100 px-3 py-1.5 rounded-xl hover:bg-indigo-100 transition-all"
                        >
                          <FileDown className="w-3.5 h-3.5" /> عرض المستند
                        </a>
                      ) : (
                        <span className="text-xs text-slate-400 font-bold">بدون مستند</span>
                      )}
                    </td>
                  </tr>
                ))}
                {expenses.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-12 text-center text-slate-400 font-bold">
                      لا توجد مصروفات مسجلة في هذه الفترة المحددة.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Expense Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-6">
            <div className="flex justify-between items-center border-b border-slate-100 pb-4">
              <h2 className="text-xl font-bold text-slate-800">تسجيل مصروف جديد</h2>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600 font-bold cursor-pointer">✕</button>
            </div>

            {modalError && (
              <div className="bg-red-50 border border-red-100 text-red-800 px-4 py-2.5 rounded-xl flex items-center gap-2.5 text-xs font-bold">
                <AlertCircle className="w-5 h-5 text-red-500" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleAddExpense} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-2">تصنيف المصروف</label>
                <select value={category} onChange={e => setCategory(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold">
                  <option value="أدوات مكتبية">أدوات مكتبية ومطبوعات</option>
                  <option value="إيجارات">إيجارات قاعات وفصول</option>
                  <option value="رواتب ومساعدين">رواتب وبدلات مساعدين</option>
                  <option value="تسويق وإعلانات">تسويق وحملات إعلانية</option>
                  <option value="خدمات وإنترنت">فواتير مياه/كهرباء/إنترنت</option>
                  <option value="أخرى">أخرى</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-2">القيمة المالية المصروفة (ج.م)</label>
                  <input required type="number" min="1" value={amount} onChange={e => setAmount(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-2">تاريخ الصرف</label>
                  <input required type="date" value={spentAt} onChange={e => setSpentAt(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-2">طريقة الدفع للمورد</label>
                <select value={method} onChange={e => setMethod(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold">
                  <option value="CASH">كاش (نقدي)</option>
                  <option value="INSTAPAY">إنستا باي (InstaPay)</option>
                  <option value="VODAFONE_CASH">فودافون كاش</option>
                  <option value="BANK_TRANSFER">تحويل بنكي</option>
                  <option value="OTHER">أخرى</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-2">البيان / الوصف بالتفصيل</label>
                <textarea required rows={2} placeholder="مثال: شراء ورق تصوير لجروب SAT 1" value={description} onChange={e => setDescription(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold"></textarea>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-2">إرفاق إثبات الصرف / الفاتورة</label>
                <input type="file" accept="image/*,application/pdf" onChange={e => setReceiptFile(e.target.files ? e.target.files[0] : null)} className="w-full text-xs text-slate-400 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200" />
              </div>

              <div className="flex gap-4 border-t border-slate-100 pt-4">
                <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 bg-slate-100 text-slate-700 py-3 rounded-xl font-bold cursor-pointer">إلغاء</button>
                <button type="submit" disabled={modalLoading} className="flex-1 bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-500 disabled:bg-emerald-800 cursor-pointer">
                  {modalLoading ? 'جاري الحفظ...' : 'تسجيل المصروف'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}