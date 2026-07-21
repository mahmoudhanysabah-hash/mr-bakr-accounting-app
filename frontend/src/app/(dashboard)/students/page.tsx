'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import api from '@/lib/axios';
import { 
  Plus, 
  Search, 
  Filter, 
  UserRound, 
  Phone, 
  ChevronLeft, 
  CheckCircle, 
  AlertCircle 
} from 'lucide-react';

export default function StudentsPage() {
  const [students, setStudents] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterGroup, setFilterGroup] = useState('');

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Add Student Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [studentPhone, setStudentPhone] = useState('');
  const [guardianName, setGuardianName] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [gradeLevel, setGradeLevel] = useState('');
  const [academicTrack, setAcademicTrack] = useState('');
  const [notes, setNotes] = useState('');
  const [joinsAt, setJoinsAt] = useState(new Date().toISOString().split('T')[0]);
  const [initialGroupId, setInitialGroupId] = useState('');
  const [initialPrice, setInitialPrice] = useState('300');
  const [joinsSessions, setJoinsSessions] = useState('8');

  const [modalError, setModalError] = useState('');
  const [modalLoading, setModalLoading] = useState(false);

  const fetchStudents = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/accounting/students', {
        params: {
          q: search || undefined,
          status: filterStatus || undefined,
          groupId: filterGroup || undefined
        }
      });
      setStudents(res.data?.data || res.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [search, filterStatus, filterGroup]);

  useEffect(() => {
    // Fetch initial list of students and groups
    fetchStudents();
    api.get('/accounting/groups').then(res => setGroups(res.data?.data || []));
  }, [fetchStudents]);

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalLoading(true);
    setModalError('');

    try {
      // 1. Create Student
      const studentRes = await api.post('/accounting/students', {
        fullName: name,
        code: code || undefined,
        studentPhone: studentPhone || undefined,
        guardianName: guardianName || undefined,
        guardianPhone: guardianPhone || undefined,
        gradeLevel: gradeLevel || undefined,
        academicTrack: academicTrack || undefined,
        notes: notes || undefined,
        joinedAt: new Date(joinsAt).toISOString()
      });

      const studentId = studentRes.data?.data?.id || studentRes.data?.id;

      // 2. Enroll in group (if group selected)
      if (studentId && initialGroupId) {
        await api.post('/accounting/enrollments', {
          studentId: studentId,
          groupId: initialGroupId,
          startsAt: new Date(joinsAt).toISOString(),
          customSessionPrice: initialPrice ? Number(initialPrice) : undefined,
          customSessionsPerMonth: joinsSessions ? Number(joinsSessions) : undefined
        });
      }

      setShowAddModal(false);
      // Reset form
      setName('');
      setCode('');
      setStudentPhone('');
      setGuardianName('');
      setGuardianPhone('');
      setGradeLevel('');
      setAcademicTrack('');
      setNotes('');
      setInitialGroupId('');
      fetchStudents();
    } catch (err: any) {
      setModalError(err.response?.data?.error || 'فشل تسجيل الطالب. يرجى مراجعة المدخلات.');
    } finally {
      setModalLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return <span className="bg-emerald-50 text-emerald-800 border border-emerald-100 px-3 py-1 rounded-full text-xs font-black">نشط</span>;
      case 'PAUSED':
        return <span className="bg-amber-50 text-amber-800 border border-amber-100 px-3 py-1 rounded-full text-xs font-black">موقوف مؤقتاً</span>;
      case 'WITHDRAWN':
        return <span className="bg-red-50 text-red-800 border border-red-100 px-3 py-1 rounded-full text-xs font-black">منسحب</span>;
      case 'COMPLETED':
        return <span className="bg-slate-100 text-slate-600 border border-slate-200 px-3 py-1 rounded-full text-xs font-black">مكتمل</span>;
      default:
        return <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-xs font-black">{status}</span>;
    }
  };

  return (
    <div className="space-y-8 font-cairo" dir="rtl">
      {/* Title section */}
      <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">شؤون الطلاب المالية</h1>
          <p className="text-slate-500 text-sm mt-1">عرض وتسجيل حسابات الطلاب الجدد والحاليين</p>
        </div>
        <button 
          onClick={() => setShowAddModal(true)} 
          className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-3 rounded-xl font-bold flex items-center gap-2 shadow-md shadow-emerald-500/10 cursor-pointer"
        >
          <Plus className="w-5 h-5" />
          <span>تسجيل طالب جديد</span>
        </button>
      </div>

      {/* Filters & Search */}
      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Search */}
        <div className="relative md:col-span-2">
          <input
            type="text"
            placeholder="بحث باسم الطالب، الكود، أو رقم الهاتف..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-4 pr-11 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500 text-sm font-semibold"
          />
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 h-5 w-5" />
        </div>

        {/* Filter Status */}
        <div className="relative">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500 text-sm font-semibold"
          >
            <option value="">كل حالات الطلاب</option>
            <option value="ACTIVE">نشط</option>
            <option value="PAUSED">موقوف مؤقتاً</option>
            <option value="WITHDRAWN">منسحب</option>
            <option value="COMPLETED">مكتمل</option>
          </select>
        </div>

        {/* Filter Group */}
        <div className="relative">
          <select
            value={filterGroup}
            onChange={(e) => setFilterGroup(e.target.value)}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500 text-sm font-semibold"
          >
            <option value="">كل المجموعات الدراسية</option>
            {groups.map(group => (
              <option key={group.id} value={group.id}>{group.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Students Data Table */}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-20 text-center space-y-4">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-emerald-500 border-r-2 mx-auto"></div>
            <p className="text-slate-400 font-bold text-sm">جاري تحميل قائمة الطلاب...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right divide-y divide-slate-100">
              <thead className="bg-slate-50">
                <tr>
                  <th className="p-4 font-bold text-slate-500 text-xs uppercase">كود الطالب</th>
                  <th className="p-4 font-bold text-slate-500 text-xs uppercase">الاسم الكامل</th>
                  <th className="p-4 font-bold text-slate-500 text-xs uppercase">رقم الهاتف</th>
                  <th className="p-4 font-bold text-slate-500 text-xs uppercase">الحالة</th>
                  <th className="p-4 font-bold text-slate-500 text-xs uppercase">تاريخ الانضمام</th>
                  <th className="p-4 font-bold text-slate-500 text-xs uppercase">الرصيد المالي</th>
                  <th className="p-4 font-bold text-slate-500 text-xs uppercase">كشف الحساب</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {students.map((student) => (
                  <tr key={student.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-4 font-black text-slate-800">{student.code}</td>
                    <td className="p-4 font-bold text-slate-900">{student.full_name}</td>
                    <td className="p-4 text-slate-500 font-semibold">{student.student_phone || 'لا يوجد'}</td>
                    <td className="p-4">{getStatusBadge(student.status)}</td>
                    <td className="p-4 text-slate-400 font-semibold">{new Date(student.joined_at).toLocaleDateString('ar-EG')}</td>
                    <td className={`p-4 font-bold ${Number(student.credit_balance) > 0 ? 'text-emerald-600' : 'text-slate-900'}`}>
                      {Number(student.credit_balance).toLocaleString('ar-EG')} ج.م
                    </td>
                    <td className="p-4">
                      <Link 
                        href={`/students/${student.id}`}
                        className="inline-flex items-center gap-1.5 text-xs font-black text-emerald-600 hover:text-emerald-700 bg-emerald-50 px-3.5 py-2 rounded-xl transition-all cursor-pointer"
                      >
                        <span>عرض الحساب</span>
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
                {students.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-slate-400 font-bold">
                      لا يوجد طلاب يطابقون خيارات البحث الحالية.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Student Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-xl shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto" dir="rtl">
            <div className="flex justify-between items-center border-b border-slate-100 pb-4">
              <h2 className="text-xl font-bold text-slate-800">تسجيل طالب جديد بالنظام المالي</h2>
              <button 
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {modalError && (
              <div className="bg-red-50 border border-red-100 text-red-800 px-4 py-3 rounded-xl flex items-center gap-2.5 text-xs font-bold">
                <AlertCircle className="w-5 h-5 text-red-500" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleAddStudent} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-2">اسم الطالب بالكامل</label>
                  <input required type="text" value={name} onChange={e => setName(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-2">كود الطالب المميز (Code)</label>
                  <input required type="text" placeholder="مثال: STU1001" value={code} onChange={e => setCode(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-2">رقم هاتف الطالب</label>
                  <input type="text" value={studentPhone} onChange={e => setStudentPhone(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-2">تاريخ الانضمام</label>
                  <input required type="date" value={joinsAt} onChange={e => setJoinsAt(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-2">اسم ولي الأمر</label>
                  <input type="text" value={guardianName} onChange={e => setGuardianName(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-2">رقم هاتف ولي الأمر</label>
                  <input type="text" value={guardianPhone} onChange={e => setGuardianPhone(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-2">الصف الدراسي [Grade]</label>
                  <input type="text" value={gradeLevel} onChange={e => setGradeLevel(e.target.value)} placeholder="مثال: [Grade 11]" className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-2">المسار الدراسي</label>
                  <select name="academic-track-create" value={academicTrack} onChange={e => setAcademicTrack(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold">
                    <option value="">غير محدد</option>
                    <option value="SAT">[SAT]</option>
                    <option value="EST">[EST]</option>
                    <option value="OTHER">مسار آخر</option>
                  </select>
                </div>
              </div>
              <div className="border-t border-slate-100 pt-4">
                <h4 className="font-bold text-slate-800 text-sm mb-3">تفاصيل الاشتراك الأولي</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-2">المجموعة الدراسية</label>
                    <select value={initialGroupId} onChange={e => setInitialGroupId(e.target.value)} className="w-full px-3 py-3 border border-slate-200 rounded-xl text-sm font-semibold">
                      <option value="">لا تشترك الآن</option>
                      {groups.map(group => (
                        <option key={group.id} value={group.id}>{group.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-2">سعر الحصة (ج.م)</label>
                    <input type="number" value={initialPrice} onChange={e => setInitialPrice(e.target.value)} className="w-full px-3 py-3 border border-slate-200 rounded-xl text-sm font-semibold" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-2">حصص الشهر</label>
                    <input type="number" value={joinsSessions} onChange={e => setJoinsSessions(e.target.value)} className="w-full px-3 py-3 border border-slate-200 rounded-xl text-sm font-semibold" />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-2">ملاحظات مالية أو عامة</label>
                <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold"></textarea>
              </div>

              <div className="flex gap-4 border-t border-slate-100 pt-4">
                <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 bg-slate-100 text-slate-700 py-3 rounded-xl font-bold cursor-pointer">إلغاء</button>
                <button type="submit" disabled={modalLoading} className="flex-1 bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-500 disabled:bg-emerald-800 cursor-pointer">
                  {modalLoading ? 'جاري التسجيل...' : 'تسجيل طالب'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
