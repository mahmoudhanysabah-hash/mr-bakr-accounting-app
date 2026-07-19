'use client';

import React, { useEffect, useState } from 'react';
import api from '@/lib/axios';
import { getApiErrorMessage } from '@/lib/error';
import { 
  Plus, 
  Users, 
  DollarSign, 
  Target, 
  CheckCircle2, 
  AlertCircle,
  Pencil,
  Trash2,
  UserPlus
} from 'lucide-react';
import { motion } from 'framer-motion';

export default function GroupsPage() {
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState('');

  // Batch Enroll State
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchGroupId, setBatchGroupId] = useState('');
  const [batchStartsAt, setBatchStartsAt] = useState(() => new Date().toISOString().split('T')[0]);
  const [studentsList, setStudentsList] = useState<any[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');

  // Form Fields
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [type, setType] = useState('REGULAR');
  const [sessionPrice, setSessionPrice] = useState('300');
  const [sessionsCount, setSessionsCount] = useState('8');
  const [studentTarget, setStudentTarget] = useState('');
  const [revenueTarget, setRevenueTarget] = useState('');
  const [active, setActive] = useState(true);

  const [modalError, setModalError] = useState('');
  const [modalLoading, setModalLoading] = useState(false);

  const fetchGroups = () => {
    setLoading(true);
    api.get('/accounting/groups')
      .then(res => setGroups(res.data?.data || []))
      .catch(e => console.error(e))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchGroups();
  }, []);

  const handleAddGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalLoading(true);
    setModalError('');

    try {
      await api.post('/accounting/groups', {
        name,
        code,
        type,
        defaultSessionPrice: Number(sessionPrice),
        defaultSessionsPerMonth: Number(sessionsCount),
        defaultStudentTarget: studentTarget ? Number(studentTarget) : undefined,
        defaultRevenueTarget: revenueTarget ? Number(revenueTarget) : undefined
      });

      setShowAddModal(false);
      // Reset form
      setName('');
      setCode('');
      setSessionPrice('300');
      setSessionsCount('8');
      setStudentTarget('');
      setRevenueTarget('');
      fetchGroups();
    } catch (err: any) {
      setModalError(getApiErrorMessage(err, 'فشل إنشاء المجموعة الدراسية.'));
    } finally {
      setModalLoading(false);
    }
  };

  const handleEditGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalLoading(true);
    setModalError('');

    try {
      await api.patch(`/accounting/groups/${editingGroupId}`, {
        name,
        type,
        defaultSessionPrice: Number(sessionPrice),
        defaultSessionsPerMonth: Number(sessionsCount),
        defaultStudentTarget: studentTarget ? Number(studentTarget) : undefined,
        defaultRevenueTarget: revenueTarget ? Number(revenueTarget) : undefined,
        active
      });

      setShowEditModal(false);
      fetchGroups();
    } catch (err: any) {
      setModalError(getApiErrorMessage(err, 'فشل تعديل المجموعة الدراسية.'));
    } finally {
      setModalLoading(false);
    }
  };

  const handleDeleteGroup = async (id: string, name: string) => {
    if (!window.confirm(`هل أنت متأكد من حذف المجموعة "${name}"؟ إذا كان بها طلاب سيتم أرشفتها فقط.`)) {
      return;
    }
    
    try {
      await api.delete(`/accounting/groups/${id}`);
      fetchGroups();
    } catch (err: any) {
      alert(getApiErrorMessage(err, 'فشل حذف المجموعة.'));
    }
  };

  const openBatchModal = async (groupId: string) => {
    setBatchGroupId(groupId);
    setSelectedStudentIds([]);
    setStudentSearch('');
    setShowBatchModal(true);
    setModalError('');
    
    // Fetch students if not already fetched
    if (studentsList.length === 0) {
      setStudentsLoading(true);
      try {
        const res = await api.get('/accounting/students?status=ACTIVE');
        setStudentsList(res.data?.data || []);
      } catch (err) {
        console.error(err);
      } finally {
        setStudentsLoading(false);
      }
    }
  };

  const toggleStudentSelection = (id: string) => {
    setSelectedStudentIds(prev => 
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  const handleBatchEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedStudentIds.length === 0) {
      setModalError('يجب اختيار طالب واحد على الأقل.');
      return;
    }

    setModalLoading(true);
    setModalError('');

    try {
      await api.post('/accounting/enrollments/bulk', {
        groupId: batchGroupId,
        studentIds: selectedStudentIds,
        startsAt: batchStartsAt
      });

      setShowBatchModal(false);
      fetchGroups();
    } catch (err: any) {
      setModalError(getApiErrorMessage(err, 'فشل إضافة الطلاب للمجموعة.'));
    } finally {
      setModalLoading(false);
    }
  };

  const filteredStudents = studentsList.filter(s => 
    s.full_name.includes(studentSearch) || s.code.includes(studentSearch) || (s.student_phone && s.student_phone.includes(studentSearch))
  );

  return (
    <div className="space-y-8 font-cairo" dir="rtl">
      {/* Action Header */}
      <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">المجموعات الدراسية (الجروبات)</h1>
          <p className="text-slate-500 text-sm mt-1">تحديد المجموعات وتعيين أسعار الحصص والمستهدفات المالية</p>
        </div>
        <button 
          onClick={() => setShowAddModal(true)} 
          className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-3 rounded-xl font-bold flex items-center gap-2 shadow-md shadow-emerald-500/10 cursor-pointer text-sm"
        >
          <Plus className="w-4.5 h-4.5" />
          <span>إنشاء مجموعة جديدة</span>
        </button>
      </div>

      {/* Groups List Grid */}
      {loading ? (
        <div className="py-20 text-center space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-emerald-500 border-r-2 mx-auto"></div>
          <p className="text-slate-400 font-bold text-sm">جاري تحميل المجموعات الدراسية...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {groups.map((group) => (
            <motion.div
              key={group.id}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow relative overflow-hidden"
            >
              {/* Badge type */}
              <div className="absolute top-4 left-4">
                <span className="text-[10px] font-black tracking-wider bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full uppercase">
                  {group.type}
                </span>
              </div>

              <div>
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-bold text-slate-800 pr-2 border-r-4 border-emerald-500">{group.name}</h3>
                  <div className="flex gap-1 relative z-10">
                    <button 
                      onClick={() => {
                        setEditingGroupId(group.id);
                        setName(group.name);
                        setCode(group.code);
                        setType(group.type);
                        setSessionPrice(String(group.default_session_price));
                        setSessionsCount(String(group.default_sessions_per_month));
                        setStudentTarget(String(group.default_student_target || ''));
                        setRevenueTarget(String(group.default_revenue_target || ''));
                        setActive(group.active);
                        setShowEditModal(true);
                      }}
                      className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-lg cursor-pointer transition-colors"
                      title="تعديل إعدادات المجموعة"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleDeleteGroup(group.id, group.name)}
                      className="p-1.5 bg-red-50 hover:bg-red-100 text-red-500 rounded-lg cursor-pointer transition-colors"
                      title="حذف المجموعة"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <span className="text-xs text-slate-400 font-bold block mt-1.5">كود المجموعة: {group.code}</span>

                <div className="mt-6 space-y-3.5 border-t border-slate-50 pt-4 text-sm font-semibold">
                  <div className="flex justify-between items-center text-slate-600">
                    <span className="flex items-center gap-1.5 text-slate-400"><DollarSign className="w-4 h-4" /> سعر الحصة:</span>
                    <span className="text-slate-800">{Number(group.default_session_price).toLocaleString('ar-EG')} ج.م</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-600">
                    <span className="flex items-center gap-1.5 text-slate-400"><Users className="w-4 h-4" /> حصص الشهر:</span>
                    <span className="text-slate-800">{group.default_sessions_per_month} حصص</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-600">
                    <span className="flex items-center gap-1.5 text-slate-400"><Users className="w-4 h-4" /> عدد الطلاب الحالي:</span>
                    <span className="text-slate-800 font-bold">{group._count?.enrollments || 0} طالب</span>
                  </div>
                  {group.default_student_target && (
                    <div className="flex justify-between items-center text-slate-600">
                      <span className="flex items-center gap-1.5 text-slate-400"><Target className="w-4 h-4" /> مستهدف الطلاب:</span>
                      <span className="text-slate-800">{group.default_student_target} طالب</span>
                    </div>
                  )}
                  {group.default_revenue_target && (
                    <div className="flex justify-between items-center text-slate-600">
                      <span className="flex items-center gap-1.5 text-slate-400"><Target className="w-4 h-4" /> المستهدف المالي:</span>
                      <span className="text-emerald-600 font-bold">{Number(group.default_revenue_target).toLocaleString('ar-EG')} ج.م</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-6 border-t border-slate-50 pt-4 flex items-center justify-between">
                <span className={`inline-flex items-center gap-1 text-xs font-black ${group.active ? 'text-emerald-600' : 'text-slate-400'}`}>
                  <CheckCircle2 className="w-4 h-4" /> {group.active ? 'نشطة حالياً' : 'موقوفة'}
                </span>
                <button 
                  onClick={() => openBatchModal(group.id)}
                  className="bg-slate-800 hover:bg-slate-700 text-white p-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                  disabled={!group.active}
                >
                  <UserPlus className="w-4 h-4" /> إضافة طلاب
                </button>
              </div>
            </motion.div>
          ))}
          {groups.length === 0 && (
            <div className="col-span-full py-16 text-center text-slate-400 font-bold">
              لا توجد مجموعات مسجلة بالنظام حالياً.
            </div>
          )}
        </div>
      )}

      {/* Add Group Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-6">
            <div className="flex justify-between items-center border-b border-slate-100 pb-4">
              <h2 className="text-xl font-bold text-slate-800">إنشاء مجموعة دراسية جديدة</h2>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600 font-bold cursor-pointer">✕</button>
            </div>

            {modalError && (
              <div className="bg-red-50 border border-red-100 text-red-800 px-4 py-2.5 rounded-xl flex items-center gap-2.5 text-xs font-bold">
                <AlertCircle className="w-5 h-5 text-red-500" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleAddGroup} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-2">اسم المجموعة (الجروب)</label>
                <input required type="text" placeholder="مثال: جروب السبت والأربعاء - SAT" value={name} onChange={e => setName(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-2">الكود الفريد للمجموعة</label>
                  <input required type="text" placeholder="مثال: G-SAT1" value={code} onChange={e => setCode(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-2">نوع الجروب</label>
                  <select value={type} onChange={e => setType(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold">
                    <option value="REGULAR">تأسيس منتظم (REGULAR)</option>
                    <option value="REVIEW">مراجعة مكثفة (REVIEW)</option>
                    <option value="EXAMS">حل امتحانات فقط</option>
                    <option value="OTHER">أخرى (OTHER)</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-2">سعر الحصة الافتراضي (ج.م)</label>
                  <input required type="number" value={sessionPrice} onChange={e => setSessionPrice(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-2">عدد الحصص الافتراضي شهرياً</label>
                  <input required type="number" value={sessionsCount} onChange={e => setSessionsCount(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-2">مستهدف عدد الطلاب (مستحب)</label>
                  <input type="number" placeholder="مثال: 50" value={studentTarget} onChange={e => setStudentTarget(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-2">مستهدف التحصيل المالي (ج.م)</label>
                  <input type="number" placeholder="مثال: 15000" value={revenueTarget} onChange={e => setRevenueTarget(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold" />
                </div>
              </div>

              <div className="flex gap-4 border-t border-slate-100 pt-4">
                <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 bg-slate-100 text-slate-700 py-3 rounded-xl font-bold cursor-pointer">إلغاء</button>
                <button type="submit" disabled={modalLoading} className="flex-1 bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-500 disabled:bg-emerald-800 cursor-pointer">
                  {modalLoading ? 'جاري الإنشاء...' : 'إنشاء المجموعة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Group Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-6">
            <div className="flex justify-between items-center border-b border-slate-100 pb-4">
              <h2 className="text-xl font-bold text-slate-800">تعديل المجموعة الدراسية</h2>
              <button onClick={() => setShowEditModal(false)} className="text-slate-400 hover:text-slate-600 font-bold cursor-pointer">✕</button>
            </div>

            {modalError && (
              <div className="bg-red-50 border border-red-100 text-red-800 px-4 py-2.5 rounded-xl flex items-center gap-2.5 text-xs font-bold">
                <AlertCircle className="w-5 h-5 text-red-500" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleEditGroup} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-2">اسم المجموعة (الجروب)</label>
                <input required type="text" value={name} onChange={e => setName(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-2">الكود الفريد (لا يتغير)</label>
                  <input required type="text" value={code} disabled className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-500 cursor-not-allowed" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-2">نوع الجروب</label>
                  <select value={type} onChange={e => setType(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold">
                    <option value="REGULAR">تأسيس منتظم (REGULAR)</option>
                    <option value="REVIEW">مراجعة مكثفة (REVIEW)</option>
                    <option value="EXAMS">حل امتحانات فقط</option>
                    <option value="OTHER">أخرى (OTHER)</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-2">سعر الحصة (ج.م)</label>
                  <input required type="number" value={sessionPrice} onChange={e => setSessionPrice(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-2">حصص الشهر الافتراضي</label>
                  <input required type="number" value={sessionsCount} onChange={e => setSessionsCount(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-2">مستهدف الطلاب</label>
                  <input type="number" value={studentTarget} onChange={e => setStudentTarget(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-2">المستهدف المالي</label>
                  <input type="number" value={revenueTarget} onChange={e => setRevenueTarget(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold" />
                </div>
              </div>

              <div className="border-t border-slate-100 pt-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} className="w-5 h-5 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500" />
                  <span className="text-sm font-bold text-slate-700">المجموعة نشطة وتقبل طلاب</span>
                </label>
              </div>

              <div className="flex gap-4 border-t border-slate-100 pt-4">
                <button type="button" onClick={() => setShowEditModal(false)} className="flex-1 bg-slate-100 text-slate-700 py-3 rounded-xl font-bold cursor-pointer">إلغاء</button>
                <button type="submit" disabled={modalLoading} className="flex-1 bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-500 disabled:bg-emerald-800 cursor-pointer">
                  {modalLoading ? 'جاري الحفظ...' : 'حفظ التعديلات'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Batch Enroll Modal */}
      {showBatchModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-2xl shadow-2xl space-y-6 max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center border-b border-slate-100 pb-4 shrink-0">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <UserPlus className="w-6 h-6 text-emerald-600" />
                إضافة طلاب للمجموعة
              </h2>
              <button onClick={() => setShowBatchModal(false)} className="text-slate-400 hover:text-slate-600 font-bold cursor-pointer">✕</button>
            </div>

            {modalError && (
              <div className="bg-red-50 border border-red-100 text-red-800 px-4 py-2.5 rounded-xl flex items-center gap-2.5 text-xs font-bold shrink-0">
                <AlertCircle className="w-5 h-5 text-red-500" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleBatchEnroll} className="min-h-0 flex-1 overflow-hidden flex flex-col space-y-4">
              <div className="shrink-0 flex gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-bold text-slate-600 mb-2">تاريخ بدء الاشتراك</label>
                  <input required type="date" value={batchStartsAt} onChange={e => setBatchStartsAt(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold" />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-bold text-slate-600 mb-2">بحث عن طلاب النشطين</label>
                  <input 
                    type="text" 
                    placeholder="بحث بالاسم أو الكود..." 
                    value={studentSearch} 
                    onChange={e => setStudentSearch(e.target.value)} 
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold focus:border-emerald-500 focus:outline-none" 
                  />
                </div>
              </div>

              <div className="shrink-0 flex flex-col gap-3 rounded-xl border border-emerald-100 bg-emerald-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm font-bold text-emerald-900">
                  تم اختيار <span className="text-base text-emerald-700">{selectedStudentIds.length}</span> طالب
                </div>
                <button
                  type="submit"
                  disabled={modalLoading || selectedStudentIds.length === 0}
                  className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-800 disabled:opacity-50"
                >
                  {modalLoading ? 'جاري الإضافة...' : `إضافة ${selectedStudentIds.length} طالب للجروب`}
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto border border-slate-200 rounded-xl p-2 bg-slate-50">
                {studentsLoading ? (
                  <div className="flex justify-center items-center h-full">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-emerald-500 border-r-2"></div>
                  </div>
                ) : filteredStudents.length === 0 ? (
                  <div className="text-center text-slate-400 font-bold p-8">لا يوجد طلاب يطابقون البحث</div>
                ) : (
                  <div className="space-y-1">
                    {filteredStudents.map(student => (
                      <label key={student.id} className="flex items-center gap-3 p-3 bg-white border border-slate-100 rounded-lg hover:border-emerald-200 cursor-pointer transition-colors">
                        <input 
                          type="checkbox" 
                          checked={selectedStudentIds.includes(student.id)} 
                          onChange={() => toggleStudentSelection(student.id)} 
                          className="w-5 h-5 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer" 
                        />
                        <div>
                          <p className="font-bold text-slate-800 text-sm">{student.full_name}</p>
                          <p className="text-xs text-slate-400 font-semibold">{student.code} | {student.student_phone}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="-mx-6 -mb-6 shrink-0 border-t border-slate-100 bg-white px-6 py-4 shadow-[0_-8px_24px_rgba(15,23,42,0.08)]">
                <div className="mb-3 flex justify-between items-center text-xs font-bold text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <span>إجمالي الطلاب المحددين:</span>
                  <span className="text-emerald-600 text-base">{selectedStudentIds.length} طالب</span>
                </div>
                <div className="flex gap-4">
                  <button type="button" onClick={() => setShowBatchModal(false)} className="flex-1 bg-slate-100 text-slate-700 py-3 rounded-xl font-bold cursor-pointer hover:bg-slate-200">إلغاء</button>
                  <button type="submit" disabled={modalLoading || selectedStudentIds.length === 0} className="flex-1 bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-500 disabled:bg-emerald-800 disabled:opacity-50 cursor-pointer transition-colors">
                    {modalLoading ? 'جاري الإضافة...' : `إضافة ${selectedStudentIds.length} طالب للجروب`}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}