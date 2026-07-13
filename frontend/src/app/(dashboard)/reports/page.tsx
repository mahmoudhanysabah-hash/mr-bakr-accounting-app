'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '@/lib/axios';
import {
  BarChart3,
  BookOpenCheck,
  CalendarCheck,
  Download,
  Filter,
  PhoneCall,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
  UserX,
} from 'lucide-react';

type SummaryStats = {
  totalCollected: number;
  totalRefunds: number;
  totalDiscounts: number;
  totalExpenses: number;
  netIncome: number;
};

type ArrearsStudent = {
  studentId: string;
  studentName: string;
  studentPhone?: string | null;
  guardianPhone?: string | null;
  studentStatus: string;
  groups: string[];
  oldestPeriod: string;
  chargesCount: number;
  totalDue: number;
  totalPaid: number;
  totalOutstanding: number;
};

type ArrearsGroup = {
  groupId: string;
  groupName: string;
  groupCode: string;
  studentsCount: number;
  chargesCount: number;
  totalDue: number;
  totalPaid: number;
  totalOutstanding: number;
};

type ArrearsReport = {
  totals: {
    totalDue: number;
    totalPaid: number;
    totalOutstanding: number;
    studentsCount: number;
    groupsCount: number;
    chargesCount: number;
  };
  students: ArrearsStudent[];
  groups: ArrearsGroup[];
};

type TeachingGroupRow = {
  groupId: string;
  groupName: string;
  sessions: number;
  studentsCount: number;
  attendanceRecords: number;
  absent: number;
  late: number;
  excused: number;
  uncontactedAbsences: number;
  guardianContacts: number;
  academicFollowUps: number;
  needsWork: number;
};

type TeachingStudentRow = {
  studentId: string;
  studentName: string;
  studentCode: string;
  guardianPhone?: string | null;
  groupName: string;
  absences: number;
  late: number;
  uncontactedAbsences: number;
  guardianContacts: number;
  academicFollowUps: number;
  needsWork: number;
  lastAbsenceDate?: string | null;
  lastContactStatus?: string | null;
  lastFollowUpResult?: string | null;
};

type TeachingRecentContact = {
  id: string;
  studentName: string;
  groupName: string;
  status: string;
  response?: string | null;
  contactedAt?: string | null;
  assistantName?: string | null;
};

type TeachingRecentFollowUp = {
  id: string;
  studentName: string;
  groupName: string;
  activityType: string;
  result: string;
  score?: number | null;
  maxScore?: number | null;
  entryDate: string;
  assistantName?: string | null;
};

type AssistantReportRow = {
  assistantId: string;
  assistantName: string;
  attendanceRecords: number;
  guardianContacts: number;
  academicFollowUps: number;
};

type TeachingOperationsReport = {
  totals: {
    sessions: number;
    attendanceRecords: number;
    present: number;
    absent: number;
    late: number;
    leftEarly: number;
    excused: number;
    uncontactedAbsences: number;
    guardianContacts: number;
    academicFollowUps: number;
    needsWork: number;
  };
  groups: TeachingGroupRow[];
  students: TeachingStudentRow[];
  recentGuardianContacts: TeachingRecentContact[];
  recentAcademicFollowUps: TeachingRecentFollowUp[];
  assistants: AssistantReportRow[];
};

type BillingPeriod = {
  id: string;
  year: number;
  month: number;
  status: string;
};

type Group = {
  id: string;
  name: string;
  code: string;
};

function unwrapData<T>(payload: T | { data: T }): T {
  return 'data' in Object(payload) ? (payload as { data: T }).data : (payload as T);
}

function money(value?: number) {
  return Number(value || 0).toLocaleString('ar-EG');
}

function count(value?: number) {
  return Number(value || 0).toLocaleString('ar-EG');
}

function dateInputDaysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split('T')[0];
}

function todayInputValue() {
  return new Date().toISOString().split('T')[0];
}

function contactStatusLabel(status?: string | null) {
  const labels: Record<string, string> = {
    PENDING: 'لم يتم التواصل',
    CONTACTED: 'تم الرد',
    NO_ANSWER: 'لم يتم الرد',
    EXCUSED: 'عذر مقبول',
    NEEDS_FOLLOW_UP: 'يحتاج متابعة',
    WRONG_NUMBER: 'رقم غير صحيح',
  };
  return status ? labels[status] || status : '-';
}

function followUpResultLabel(result?: string | null) {
  const labels: Record<string, string> = {
    IMPROVED: 'تحسن',
    NOT_IMPROVED: 'لم يتحسن',
    NEEDS_MORE_WORK: 'يحتاج شغل أكثر',
    NOT_ASSESSED: 'لم يتم التقييم',
  };
  return result ? labels[result] || result : '-';
}

function activityLabel(activity?: string | null) {
  const labels: Record<string, string> = {
    HOMEWORK: 'واجب',
    CLASSWORK: 'تطبيق داخل الحصة',
    QUIZ: 'اختبار قصير',
    EXAM: 'امتحان',
    OTHER: 'متابعة أخرى',
  };
  return activity ? labels[activity] || activity : '-';
}

function errorMessage(error: unknown, fallback: string) {
  const response = (error as { response?: { data?: { error?: string; message?: string | string[] } } }).response;
  const message = response?.data?.message;
  if (response?.data?.error) return response.data.error;
  if (Array.isArray(message)) return message.join('، ');
  if (message) return message;
  return fallback;
}

function csvCell(value: string | number | null | undefined) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

export default function ReportsPage() {
  const [summary, setSummary] = useState<SummaryStats | null>(null);
  const [arrears, setArrears] = useState<ArrearsReport | null>(null);
  const [teachingReport, setTeachingReport] = useState<TeachingOperationsReport | null>(null);
  const [periods, setPeriods] = useState<BillingPeriod[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [arrearsLoading, setArrearsLoading] = useState(true);
  const [teachingLoading, setTeachingLoading] = useState(true);
  const [error, setError] = useState('');

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [periodFilter, setPeriodFilter] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [teachingStartDate, setTeachingStartDate] = useState(dateInputDaysAgo(30));
  const [teachingEndDate, setTeachingEndDate] = useState(todayInputValue());
  const [teachingGroupFilter, setTeachingGroupFilter] = useState('');

  const selectedPeriodLabel = useMemo(() => {
    const period = periods.find((item) => item.id === periodFilter);
    return period ? `${period.month} / ${period.year}` : 'كل الشهور';
  }, [periodFilter, periods]);

  const selectedGroupLabel = useMemo(() => {
    const group = groups.find((item) => item.id === groupFilter);
    return group?.name || 'كل الجروبات';
  }, [groupFilter, groups]);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', new Date(startDate).toISOString());
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        params.append('endDate', end.toISOString());
      }
      const response = await api.get(`/accounting/reports/summary?${params.toString()}`);
      setSummary(unwrapData<SummaryStats>(response.data));
    } catch (err) {
      setError(errorMessage(err, 'تعذر تحميل ملخص التقارير'));
    } finally {
      setLoading(false);
    }
  }, [endDate, startDate]);

  const fetchArrears = useCallback(async () => {
    setArrearsLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (periodFilter) params.append('periodId', periodFilter);
      if (groupFilter) params.append('groupId', groupFilter);
      const response = await api.get(`/accounting/reports/arrears?${params.toString()}`);
      setArrears(unwrapData<ArrearsReport>(response.data));
    } catch (err) {
      setError(errorMessage(err, 'تعذر تحميل تقرير المتأخرات'));
    } finally {
      setArrearsLoading(false);
    }
  }, [groupFilter, periodFilter]);

  const fetchTeachingReport = useCallback(async () => {
    setTeachingLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (teachingStartDate) params.append('startDate', new Date(teachingStartDate).toISOString());
      if (teachingEndDate) {
        const end = new Date(teachingEndDate);
        end.setHours(23, 59, 59, 999);
        params.append('endDate', end.toISOString());
      }
      if (teachingGroupFilter) params.append('groupId', teachingGroupFilter);
      const response = await api.get(`/teaching/reports/operations?${params.toString()}`);
      setTeachingReport(unwrapData<TeachingOperationsReport>(response.data));
    } catch (err) {
      setError(errorMessage(err, 'تعذر تحميل تقرير التشغيل الدراسي'));
    } finally {
      setTeachingLoading(false);
    }
  }, [teachingEndDate, teachingGroupFilter, teachingStartDate]);

  useEffect(() => {
    void fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    const loadReferenceData = async () => {
      try {
        const [periodsResponse, groupsResponse] = await Promise.all([
          api.get('/accounting/periods'),
          api.get('/accounting/groups'),
        ]);
        setPeriods(unwrapData<BillingPeriod[]>(periodsResponse.data));
        setGroups(unwrapData<Group[]>(groupsResponse.data));
      } catch (err) {
        setError(errorMessage(err, 'تعذر تحميل فلاتر التقارير'));
      }
    };
    void loadReferenceData();
  }, []);

  useEffect(() => {
    void fetchArrears();
  }, [fetchArrears]);

  useEffect(() => {
    void fetchTeachingReport();
  }, [fetchTeachingReport]);

  const clearFinancialFilters = () => {
    setStartDate('');
    setEndDate('');
  };

  const clearArrearsFilters = () => {
    setPeriodFilter('');
    setGroupFilter('');
  };

  const clearTeachingFilters = () => {
    setTeachingStartDate(dateInputDaysAgo(30));
    setTeachingEndDate(todayInputValue());
    setTeachingGroupFilter('');
  };

  const exportArrearsCsv = () => {
    if (!arrears) return;
    const header = ['الطالب', 'هاتف الطالب', 'هاتف ولي الأمر', 'الجروبات', 'أقدم شهر', 'المطلوب', 'المدفوع', 'الباقي'];
    const lines = arrears.students.map((student) => [
      student.studentName,
      student.studentPhone || '',
      student.guardianPhone || '',
      student.groups.join(' / '),
      student.oldestPeriod,
      student.totalDue,
      student.totalPaid,
      student.totalOutstanding,
    ]);

    const csv = [header, ...lines].map((row) => row.map(csvCell).join(',')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const safeName = `متأخرات_${selectedPeriodLabel}_${selectedGroupLabel}`.replace(/[\\/:*?"<>|]/g, '-');
    link.download = `${safeName}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportTeachingCsv = () => {
    if (!teachingReport) return;
    const header = ['الطالب', 'الكود', 'الجروب', 'الغياب', 'التأخير', 'غياب بدون تواصل', 'تواصل ولي الأمر', 'متابعة دراسية', 'يحتاج شغل', 'آخر حالة تواصل', 'آخر نتيجة متابعة'];
    const lines = teachingReport.students.map((student) => [
      student.studentName,
      student.studentCode,
      student.groupName,
      student.absences,
      student.late,
      student.uncontactedAbsences,
      student.guardianContacts,
      student.academicFollowUps,
      student.needsWork,
      contactStatusLabel(student.lastContactStatus),
      followUpResultLabel(student.lastFollowUpResult),
    ]);

    const csv = [header, ...lines].map((row) => row.map(csvCell).join(',')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const safeName = `تقرير_التشغيل_الدراسي_${teachingStartDate}_${teachingEndDate}`.replace(/[\\/:*?"<>|]/g, '-');
    link.download = `${safeName}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-7 font-cairo" dir="rtl">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black text-slate-900">
            <BarChart3 className="h-6 w-6 text-emerald-600" />
            التقارير
          </h1>
          <p className="mt-1 text-sm font-semibold text-slate-500">ملخص سريع للتحصيل والمتأخرات والحضور والمتابعة حسب الطالب والجروب</p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm font-bold text-red-700">
          {error}
        </div>
      )}

      <section className="space-y-4">
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
          <div className="font-black text-slate-800">ملخص المال</div>
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold outline-none focus:border-emerald-500" />
            <span className="text-center text-sm font-bold text-slate-400">إلى</span>
            <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold outline-none focus:border-emerald-500" />
            <button onClick={fetchSummary} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700">
              <Filter className="h-4 w-4" />
              تطبيق
            </button>
            {(startDate || endDate) && (
              <button onClick={clearFinancialFilters} className="rounded-xl bg-slate-100 p-2 text-slate-600 hover:bg-slate-200" title="مسح الفلتر">
                <RefreshCw className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>

        {loading || !summary ? (
          <div className="rounded-2xl border border-slate-100 bg-white p-10 text-center text-sm font-bold text-slate-400">جاري تحميل الملخص...</div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="إجمالي التحصيل" value={summary.totalCollected} icon={<TrendingUp className="h-5 w-5" />} tone="emerald" />
            <MetricCard title="المصروفات" value={summary.totalExpenses} icon={<TrendingDown className="h-5 w-5" />} tone="red" />
            <MetricCard title="المرتجعات" value={summary.totalRefunds} icon={<Wallet className="h-5 w-5" />} tone="amber" />
            <MetricCard title="صافي الدخل" value={summary.netIncome} icon={<BarChart3 className="h-5 w-5" />} tone="blue" />
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="font-black text-slate-800">تقرير التشغيل الدراسي</div>
            <p className="mt-1 text-xs font-bold text-slate-500">الحضور والغياب وتواصل ولي الأمر والمتابعة الدراسية في نفس الفترة</p>
          </div>
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <input type="date" value={teachingStartDate} onChange={(event) => setTeachingStartDate(event.target.value)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold outline-none focus:border-emerald-500" />
            <span className="text-center text-sm font-bold text-slate-400">إلى</span>
            <input type="date" value={teachingEndDate} onChange={(event) => setTeachingEndDate(event.target.value)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold outline-none focus:border-emerald-500" />
            <select value={teachingGroupFilter} onChange={(event) => setTeachingGroupFilter(event.target.value)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold outline-none focus:border-emerald-500">
              <option value="">كل الجروبات</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>{group.name}</option>
              ))}
            </select>
            <button onClick={fetchTeachingReport} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">
              <Filter className="h-4 w-4" />
              تحديث
            </button>
            <button onClick={exportTeachingCsv} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700">
              <Download className="h-4 w-4" />
              تصدير
            </button>
            {(teachingGroupFilter || teachingStartDate !== dateInputDaysAgo(30) || teachingEndDate !== todayInputValue()) && (
              <button onClick={clearTeachingFilters} className="rounded-xl bg-slate-100 p-2 text-slate-600 hover:bg-slate-200" title="مسح الفلتر">
                <RefreshCw className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>

        {teachingLoading || !teachingReport ? (
          <div className="rounded-2xl border border-slate-100 bg-white p-10 text-center text-sm font-bold text-slate-400">جاري تحميل تقرير التشغيل الدراسي...</div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard title="الحصص" value={teachingReport.totals.sessions} suffix="حصة" icon={<CalendarCheck className="h-5 w-5" />} tone="blue" />
              <MetricCard title="غياب بدون تواصل" value={teachingReport.totals.uncontactedAbsences} suffix="حالة" icon={<UserX className="h-5 w-5" />} tone="red" />
              <MetricCard title="تواصل ولي الأمر" value={teachingReport.totals.guardianContacts} suffix="تواصل" icon={<PhoneCall className="h-5 w-5" />} tone="emerald" />
              <MetricCard title="يحتاج شغل" value={teachingReport.totals.needsWork} suffix="متابعة" icon={<BookOpenCheck className="h-5 w-5" />} tone="amber" />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                <div className="mb-4 text-base font-black text-slate-900">ملخص الحضور</div>
                <div className="grid grid-cols-2 gap-3 text-sm font-bold md:grid-cols-3">
                  <div className="rounded-xl bg-emerald-50 p-3 text-emerald-700">حاضر<br /><span className="text-xl font-black">{count(teachingReport.totals.present)}</span></div>
                  <div className="rounded-xl bg-red-50 p-3 text-red-700">غائب<br /><span className="text-xl font-black">{count(teachingReport.totals.absent)}</span></div>
                  <div className="rounded-xl bg-amber-50 p-3 text-amber-700">متأخر<br /><span className="text-xl font-black">{count(teachingReport.totals.late)}</span></div>
                  <div className="rounded-xl bg-blue-50 p-3 text-blue-700">خرج بدري<br /><span className="text-xl font-black">{count(teachingReport.totals.leftEarly)}</span></div>
                  <div className="rounded-xl bg-slate-100 p-3 text-slate-700">بعذر<br /><span className="text-xl font-black">{count(teachingReport.totals.excused)}</span></div>
                  <div className="rounded-xl bg-slate-100 p-3 text-slate-700">إجمالي التسجيل<br /><span className="text-xl font-black">{count(teachingReport.totals.attendanceRecords)}</span></div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                <div className="mb-4 text-base font-black text-slate-900">أداء المساعدين</div>
                {teachingReport.assistants.length === 0 ? (
                  <div className="p-6 text-center text-sm font-bold text-slate-400">لا يوجد نشاط مسجل للمساعدين في الفترة الحالية.</div>
                ) : (
                  <div className="space-y-2">
                    {teachingReport.assistants.slice(0, 6).map((assistant) => (
                      <div key={assistant.assistantId} className="rounded-xl border border-slate-100 p-3">
                        <div className="font-black text-slate-900">{assistant.assistantName}</div>
                        <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs font-bold text-slate-600">
                          <div className="rounded-lg bg-slate-50 p-2">حضور<br />{count(assistant.attendanceRecords)}</div>
                          <div className="rounded-lg bg-slate-50 p-2">تواصل<br />{count(assistant.guardianContacts)}</div>
                          <div className="rounded-lg bg-slate-50 p-2">متابعة<br />{count(assistant.academicFollowUps)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <ReportTable title="جروبات محتاجة متابعة">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="p-3 font-bold">الجروب</th>
                  <th className="p-3 font-bold">الحصص</th>
                  <th className="p-3 font-bold">الطلبة</th>
                  <th className="p-3 font-bold">غياب</th>
                  <th className="p-3 font-bold">تأخير</th>
                  <th className="p-3 font-bold">بدون تواصل</th>
                  <th className="p-3 font-bold">تواصل</th>
                  <th className="p-3 font-bold">متابعة</th>
                  <th className="p-3 font-bold">يحتاج شغل</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {teachingReport.groups.length === 0 ? (
                  <tr><td colSpan={9} className="p-8 text-center text-sm font-bold text-slate-400">لا يوجد تشغيل دراسي في الفترة الحالية</td></tr>
                ) : teachingReport.groups.map((group) => (
                  <tr key={group.groupId} className="hover:bg-slate-50">
                    <td className="p-3 font-black text-slate-900">{group.groupName}</td>
                    <td className="p-3 text-slate-600">{count(group.sessions)}</td>
                    <td className="p-3 text-slate-600">{count(group.studentsCount)}</td>
                    <td className="p-3 font-bold text-red-700">{count(group.absent + group.excused)}</td>
                    <td className="p-3 font-bold text-amber-700">{count(group.late)}</td>
                    <td className="p-3 font-black text-red-700">{count(group.uncontactedAbsences)}</td>
                    <td className="p-3 font-bold text-emerald-700">{count(group.guardianContacts)}</td>
                    <td className="p-3 font-bold text-blue-700">{count(group.academicFollowUps)}</td>
                    <td className="p-3 font-black text-amber-700">{count(group.needsWork)}</td>
                  </tr>
                ))}
              </tbody>
            </ReportTable>

            <ReportTable title="طلبة محتاجين متابعة">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="p-3 font-bold">الطالب</th>
                  <th className="p-3 font-bold">الجروب</th>
                  <th className="p-3 font-bold">الغياب</th>
                  <th className="p-3 font-bold">التأخير</th>
                  <th className="p-3 font-bold">بدون تواصل</th>
                  <th className="p-3 font-bold">تواصل ولي الأمر</th>
                  <th className="p-3 font-bold">متابعة دراسية</th>
                  <th className="p-3 font-bold">آخر نتيجة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {teachingReport.students.length === 0 ? (
                  <tr><td colSpan={8} className="p-8 text-center text-sm font-bold text-slate-400">لا يوجد طلبة يحتاجون متابعة في الفترة الحالية</td></tr>
                ) : teachingReport.students.map((student) => (
                  <tr key={student.studentId} className="hover:bg-slate-50">
                    <td className="p-3">
                      <div className="font-black text-slate-900">{student.studentName}</div>
                      <div className="text-xs font-semibold text-slate-500">{student.studentCode}</div>
                    </td>
                    <td className="p-3 text-slate-600">{student.groupName}</td>
                    <td className="p-3 font-bold text-red-700">{count(student.absences)}</td>
                    <td className="p-3 font-bold text-amber-700">{count(student.late)}</td>
                    <td className="p-3 font-black text-red-700">{count(student.uncontactedAbsences)}</td>
                    <td className="p-3 text-slate-600">{count(student.guardianContacts)}</td>
                    <td className="p-3 text-slate-600">{count(student.academicFollowUps)}</td>
                    <td className="p-3 font-bold text-slate-700">{followUpResultLabel(student.lastFollowUpResult)}</td>
                  </tr>
                ))}
              </tbody>
            </ReportTable>

            <div className="grid gap-4 xl:grid-cols-2">
              <ReportTable title="آخر تواصل مع ولي الأمر">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="p-3 font-bold">الطالب</th>
                    <th className="p-3 font-bold">الجروب</th>
                    <th className="p-3 font-bold">الحالة</th>
                    <th className="p-3 font-bold">المساعد</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {teachingReport.recentGuardianContacts.length === 0 ? (
                    <tr><td colSpan={4} className="p-8 text-center text-sm font-bold text-slate-400">لا يوجد تواصل مسجل في الفترة الحالية</td></tr>
                  ) : teachingReport.recentGuardianContacts.slice(0, 8).map((contact) => (
                    <tr key={contact.id} className="hover:bg-slate-50">
                      <td className="p-3 font-black text-slate-900">{contact.studentName}</td>
                      <td className="p-3 text-slate-600">{contact.groupName}</td>
                      <td className="p-3 font-bold text-slate-700">{contactStatusLabel(contact.status)}</td>
                      <td className="p-3 text-slate-600">{contact.assistantName || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </ReportTable>

              <ReportTable title="آخر متابعة دراسية">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="p-3 font-bold">الطالب</th>
                    <th className="p-3 font-bold">النوع</th>
                    <th className="p-3 font-bold">الدرجة</th>
                    <th className="p-3 font-bold">النتيجة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {teachingReport.recentAcademicFollowUps.length === 0 ? (
                    <tr><td colSpan={4} className="p-8 text-center text-sm font-bold text-slate-400">لا يوجد متابعة دراسية في الفترة الحالية</td></tr>
                  ) : teachingReport.recentAcademicFollowUps.slice(0, 8).map((entry) => (
                    <tr key={entry.id} className="hover:bg-slate-50">
                      <td className="p-3 font-black text-slate-900">{entry.studentName}</td>
                      <td className="p-3 text-slate-600">{activityLabel(entry.activityType)}</td>
                      <td className="p-3 text-slate-600">{entry.score ?? '-'} / {entry.maxScore ?? '-'}</td>
                      <td className="p-3 font-bold text-slate-700">{followUpResultLabel(entry.result)}</td>
                    </tr>
                  ))}
                </tbody>
              </ReportTable>
            </div>
          </>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="font-black text-slate-800">تقرير المتأخرات</div>
            <p className="mt-1 text-xs font-bold text-slate-500">مين لسه مدفعش، ومين عليه باقي، وأنهي جروب عليه فلوس</p>
          </div>
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <select value={periodFilter} onChange={(event) => setPeriodFilter(event.target.value)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold outline-none focus:border-emerald-500">
              <option value="">كل الشهور</option>
              {periods.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.month} / {period.year} - {period.status === 'OPEN' ? 'مفتوح' : period.status === 'CLOSED' ? 'مغلق' : 'مسودة'}
                </option>
              ))}
            </select>
            <select value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold outline-none focus:border-emerald-500">
              <option value="">كل الجروبات</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>{group.name}</option>
              ))}
            </select>
            <button onClick={fetchArrears} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800">
              <Filter className="h-4 w-4" />
              تحديث
            </button>
            <button onClick={exportArrearsCsv} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700">
              <Download className="h-4 w-4" />
              تصدير
            </button>
            {(periodFilter || groupFilter) && (
              <button onClick={clearArrearsFilters} className="rounded-xl bg-slate-100 p-2 text-slate-600 hover:bg-slate-200" title="مسح الفلتر">
                <RefreshCw className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>

        {arrearsLoading || !arrears ? (
          <div className="rounded-2xl border border-slate-100 bg-white p-10 text-center text-sm font-bold text-slate-400">جاري تحميل المتأخرات...</div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <MetricCard title="إجمالي الباقي" value={arrears.totals.totalOutstanding} icon={<Wallet className="h-5 w-5" />} tone="red" />
              <MetricCard title="طلاب عليهم فلوس" value={arrears.totals.studentsCount} suffix="طالب" icon={<Users className="h-5 w-5" />} tone="amber" />
              <MetricCard title="جروبات عليها فلوس" value={arrears.totals.groupsCount} suffix="جروب" icon={<BarChart3 className="h-5 w-5" />} tone="blue" />
            </div>

            <ReportTable title="مين عليه فلوس؟">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="p-3 font-bold">الطالب</th>
                  <th className="p-3 font-bold">التليفون</th>
                  <th className="p-3 font-bold">الجروبات</th>
                  <th className="p-3 font-bold">أقدم شهر</th>
                  <th className="p-3 font-bold">المطلوب</th>
                  <th className="p-3 font-bold">المدفوع</th>
                  <th className="p-3 font-bold">الباقي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {arrears.students.length === 0 ? (
                  <tr><td colSpan={7} className="p-8 text-center text-sm font-bold text-slate-400">لا توجد متأخرات في الفلتر الحالي</td></tr>
                ) : arrears.students.map((student) => (
                  <tr key={student.studentId} className="hover:bg-slate-50">
                    <td className="p-3 font-black text-slate-900">{student.studentName}</td>
                    <td className="p-3 text-slate-600">{student.studentPhone || student.guardianPhone || '-'}</td>
                    <td className="p-3 text-slate-600">{student.groups.join(' / ')}</td>
                    <td className="p-3 text-slate-500">{student.oldestPeriod}</td>
                    <td className="p-3 font-bold text-slate-700">{money(student.totalDue)} ج.م</td>
                    <td className="p-3 font-bold text-emerald-700">{money(student.totalPaid)} ج.م</td>
                    <td className="p-3 font-black text-red-700">{money(student.totalOutstanding)} ج.م</td>
                  </tr>
                ))}
              </tbody>
            </ReportTable>

            <ReportTable title="أنهي جروب عليه فلوس؟">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="p-3 font-bold">الجروب</th>
                  <th className="p-3 font-bold">عدد الطلاب</th>
                  <th className="p-3 font-bold">مطالبات مفتوحة</th>
                  <th className="p-3 font-bold">المطلوب</th>
                  <th className="p-3 font-bold">المدفوع</th>
                  <th className="p-3 font-bold">الباقي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {arrears.groups.length === 0 ? (
                  <tr><td colSpan={6} className="p-8 text-center text-sm font-bold text-slate-400">لا توجد جروبات عليها متأخرات</td></tr>
                ) : arrears.groups.map((group) => (
                  <tr key={group.groupId} className="hover:bg-slate-50">
                    <td className="p-3 font-black text-slate-900">{group.groupName}</td>
                    <td className="p-3 text-slate-600">{group.studentsCount}</td>
                    <td className="p-3 text-slate-600">{group.chargesCount}</td>
                    <td className="p-3 font-bold text-slate-700">{money(group.totalDue)} ج.م</td>
                    <td className="p-3 font-bold text-emerald-700">{money(group.totalPaid)} ج.م</td>
                    <td className="p-3 font-black text-red-700">{money(group.totalOutstanding)} ج.م</td>
                  </tr>
                ))}
              </tbody>
            </ReportTable>
          </>
        )}
      </section>
    </div>
  );
}

function MetricCard({
  title,
  value,
  icon,
  tone,
  suffix = 'ج.م',
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  tone: 'emerald' | 'red' | 'amber' | 'blue';
  suffix?: string;
}) {
  const tones = {
    emerald: 'bg-emerald-50 text-emerald-700',
    red: 'bg-red-50 text-red-700',
    amber: 'bg-amber-50 text-amber-700',
    blue: 'bg-blue-50 text-blue-700',
  };

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-bold text-slate-500">{title}</div>
          <div className="mt-2 text-2xl font-black text-slate-900">
            {money(value)} <span className="text-sm font-bold text-slate-400">{suffix}</span>
          </div>
        </div>
        <div className={`rounded-xl p-3 ${tones[tone]}`}>{icon}</div>
      </div>
    </div>
  );
}

function ReportTable({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-4 text-base font-black text-slate-900">{title}</div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-right text-sm">
          {children}
        </table>
      </div>
    </div>
  );
}
