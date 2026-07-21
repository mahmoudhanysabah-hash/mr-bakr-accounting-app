'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BookOpenCheck,
  CalendarDays,
  FileText,
  Printer,
  RefreshCw,
  Search,
} from 'lucide-react';
import api from '@/lib/axios';
import { extractAuthUser } from '@/lib/auth';
import { getApiErrorMessage } from '@/lib/error';

type Role = 'ADMIN' | 'ACCOUNTANT' | 'FINANCE_MANAGER' | 'ASSISTANT';

type Group = {
  id: string;
  name: string;
  code: string;
};

type StudentOption = {
  id: string;
  code: string;
  full_name: string;
};

type AcademicFollowUp = {
  id: string;
  entryDate: string;
  activityType: string;
  score: number | null;
  maxScore: number | null;
  questionType: string | null;
  errorType: string | null;
  errorReason: string | null;
  correction: string | null;
  assistantAction: string | null;
  result: string;
  notes: string | null;
};

type StudentAcademicReport = {
  filters: {
    studentId: string;
    groupId: string;
    year: number;
    month: number;
    startDate: string;
    endDate: string;
  };
  student: {
    id: string;
    code: string;
    name: string;
    guardianName: string | null;
  };
  group: {
    id: string;
    name: string;
    code: string;
  };
  summary: {
    totalSessions: number;
    sessionsWithAcademicFollowUp: number;
    academicFollowUps: number;
    attendanceRecords: number;
    attendanceRate: number | null;
    averageScorePercentage: number | null;
    progressLevel: string;
    attendance: Record<string, number>;
    results: Record<string, number>;
    mainDifficulties: Array<{ label: string; count: number }>;
  };
  sessions: Array<{
    id: string;
    title: string | null;
    date: string;
    status: string;
    attendance: {
      status: string;
      minutesLate: number | null;
      leftEarlyMinutes: number | null;
      notes: string | null;
      guardianContactStatus: string | null;
    } | null;
    academicFollowUps: AcademicFollowUp[];
  }>;
  unlinkedAcademicFollowUps: AcademicFollowUp[];
};

function unwrapData<T>(payload: T | { data: T }): T {
  return 'data' in Object(payload) ? (payload as { data: T }).data : (payload as T);
}

function getErrorMessage(error: unknown, fallback: string) {
  return getApiErrorMessage(error, fallback);
}

function activityLabel(value: string) {
  return {
    HOMEWORK: 'واجب',
    CLASSWORK: 'تطبيق داخل الحصة',
    QUIZ: 'اختبار قصير',
    EXAM: 'امتحان',
    OTHER: 'متابعة أخرى',
  }[value] || 'متابعة';
}

function resultLabel(value: string) {
  return {
    IMPROVED: 'تحسن',
    NOT_IMPROVED: 'لم يتحسن',
    NEEDS_MORE_WORK: 'يحتاج شغل أكثر',
    NOT_ASSESSED: 'لم يتم التقييم',
  }[value] || value;
}

function attendanceLabel(value?: string | null) {
  return {
    PRESENT: 'حاضر',
    ABSENT: 'غائب',
    LATE: 'متأخر',
    LEFT_EARLY: 'خرج بدري',
    EXCUSED: 'غياب بعذر',
  }[value || ''] || 'غير مسجل';
}

function progressMeta(value: string) {
  return {
    STRONG: { label: 'مستوى قوي', tone: 'border-emerald-100 bg-emerald-50 text-emerald-700' },
    GOOD: { label: 'مستوى جيد', tone: 'border-blue-100 bg-blue-50 text-blue-700' },
    NEEDS_SUPPORT: { label: 'يحتاج متابعة', tone: 'border-amber-100 bg-amber-50 text-amber-700' },
    AT_RISK: { label: 'يحتاج خطة علاجية', tone: 'border-red-100 bg-red-50 text-red-700' },
    NO_DATA: { label: 'بيانات غير كافية', tone: 'border-slate-200 bg-slate-100 text-slate-600' },
  }[value] || { label: value, tone: 'border-slate-200 bg-slate-100 text-slate-600' };
}

function statusTone(value?: string | null) {
  if (value === 'PRESENT') return 'border-emerald-100 bg-emerald-50 text-emerald-700';
  if (value === 'LATE') return 'border-amber-100 bg-amber-50 text-amber-700';
  if (value === 'ABSENT' || value === 'EXCUSED') return 'border-red-100 bg-red-50 text-red-700';
  return 'border-slate-200 bg-slate-100 text-slate-600';
}

export default function StudentAcademicReportsPage() {
  const now = new Date();
  const [role, setRole] = useState<Role | ''>('');
  const [groups, setGroups] = useState<Group[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [groupId, setGroupId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [report, setReport] = useState<StudentAcademicReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [error, setError] = useState('');

  const isManager = role === 'ADMIN' || role === 'FINANCE_MANAGER';
  const progress = report ? progressMeta(report.summary.progressLevel) : null;

  const loadStudents = async (currentRole: Role, currentGroupId: string) => {
    if (!currentGroupId) {
      setStudents([]);
      setStudentId('');
      return;
    }

    setLoadingStudents(true);
    setError('');
    try {
      if (currentRole === 'ASSISTANT') {
        const response = await api.get('/teaching/assistant-students', {
          params: { groupId: currentGroupId },
        });
        const assignments = unwrapData<Array<{ student: StudentOption; status?: string }>>(response.data).filter((assignment) => assignment.status === 'ACTIVE');
        const uniqueStudents = Array.from(
          new Map(assignments.map((assignment) => [assignment.student.id, assignment.student])).values(),
        );
        setStudents(uniqueStudents);
        setStudentId((current) => current || uniqueStudents[0]?.id || '');
      } else {
        const response = await api.get('/accounting/students', {
          params: { status: 'ACTIVE', groupId: currentGroupId },
        });
        const loadedStudents = unwrapData<StudentOption[]>(response.data);
        setStudents(loadedStudents);
        setStudentId((current) => current || loadedStudents[0]?.id || '');
      }
      setReport(null);
    } catch (err) {
      setError(getErrorMessage(err, 'تعذر تحميل طلاب الجروب'));
      setStudents([]);
      setStudentId('');
    } finally {
      setLoadingStudents(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const loadPage = async () => {
      try {
        const userResponse = await api.get('/auth/me');
        const user = extractAuthUser(userResponse.data);
        if (!user) throw new Error('Unauthorized role');

        let loadedGroups: Group[] = [];
        if (user.role === 'ASSISTANT') {
          const assignmentsResponse = await api.get('/teaching/assistant-groups');
          const assignments = unwrapData<Array<{ group: Group; status?: string }>>(assignmentsResponse.data).filter((assignment) => assignment.status === 'ACTIVE');
          loadedGroups = Array.from(
            new Map(assignments.map((assignment) => [assignment.group.id, assignment.group])).values(),
          );
        } else if (user.role === 'ADMIN' || user.role === 'FINANCE_MANAGER') {
          const groupsResponse = await api.get('/accounting/groups', { params: { active: true } });
          loadedGroups = unwrapData<Group[]>(groupsResponse.data);
        }

        if (!cancelled) {
          setRole(user.role);
          setGroups(loadedGroups);
          setGroupId((current) => current || loadedGroups[0]?.id || '');
        }
      } catch (err) {
        if (!cancelled) {
          setError(getErrorMessage(err, 'تعذر تحميل بيانات التقرير'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadPage();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (role && groupId) {
      setStudentId('');
      void loadStudents(role, groupId);
    }
  }, [role, groupId]);

  const loadReport = async () => {
    if (!studentId || !groupId || !year || !month) return;
    setLoadingReport(true);
    setError('');
    try {
      const response = await api.get('/teaching/reports/student-academic', {
        params: {
          studentId,
          groupId,
          year: Number(year),
          month: Number(month),
        },
      });
      setReport(unwrapData<StudentAcademicReport>(response.data));
    } catch (err) {
      setReport(null);
      setError(getErrorMessage(err, 'تعذر تحميل التقرير الشهري'));
    } finally {
      setLoadingReport(false);
    }
  };

  const monthLabel = useMemo(
    () => new Date(Number(year), Number(month) - 1, 1).toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' }),
    [month, year],
  );

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-100 bg-white p-12 text-center font-cairo text-sm font-bold text-slate-500" dir="rtl">
        جاري تحميل تقرير الطالب...
      </div>
    );
  }

  return (
    <div className="space-y-6 font-cairo" dir="rtl">
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <Link href="/sessions" className="mb-3 inline-flex items-center gap-2 text-sm font-bold text-emerald-700 hover:text-emerald-800">
            <ArrowRight className="h-4 w-4" />
            العودة إلى تشغيل الحصص
          </Link>
          <h1 className="flex items-center gap-2 text-2xl font-black text-slate-900">
            <FileText className="h-7 w-7 text-blue-600" />
            التقرير الشهري لكل طالب
          </h1>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            تقرير خاص يوضح مستوى الطالب جلسة بجلسة خلال الشهر المحدد.
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={!report}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          <Printer className="h-4 w-4" />
          طباعة التقرير
        </button>
      </div>

      {error && <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div>}

      <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Search className="h-5 w-5 text-blue-600" />
          <h2 className="text-lg font-black text-slate-900">اختيار الطالب والشهر</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <label className="space-y-2 text-sm font-bold text-slate-700">
            <span>الجروب</span>
            <select
              value={groupId}
              onChange={(event) => setGroupId(event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold outline-none focus:border-blue-500"
            >
              {groups.map((group) => (
                <option key={group.id} value={group.id}>{group.name}</option>
              ))}
            </select>
          </label>
          <label className="space-y-2 text-sm font-bold text-slate-700">
            <span>الطالب</span>
            <select
              value={studentId}
              onChange={(event) => setStudentId(event.target.value)}
              disabled={loadingStudents || students.length === 0}
              className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold outline-none focus:border-blue-500 disabled:bg-slate-50"
            >
              {students.length === 0 ? <option value="">لا يوجد طلاب مسندون</option> : null}
              {students.map((student) => (
                <option key={student.id} value={student.id}>{student.full_name} ({student.code})</option>
              ))}
            </select>
          </label>
          <label className="space-y-2 text-sm font-bold text-slate-700">
            <span>السنة</span>
            <input
              type="number"
              min="2000"
              max="2100"
              value={year}
              onChange={(event) => setYear(event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold outline-none focus:border-blue-500"
            />
          </label>
          <label className="space-y-2 text-sm font-bold text-slate-700">
            <span>الشهر</span>
            <select
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold outline-none focus:border-blue-500"
            >
              {Array.from({ length: 12 }, (_, index) => (
                <option key={index + 1} value={index + 1}>
                  {new Date(2020, index, 1).toLocaleDateString('ar-EG', { month: 'long' })}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="button"
          onClick={() => void loadReport()}
          disabled={loadingReport || loadingStudents || !studentId || !groupId}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white transition hover:bg-blue-700 disabled:opacity-60"
        >
          {loadingReport ? <RefreshCw className="h-4 w-4 animate-spin" /> : <BookOpenCheck className="h-4 w-4" />}
          عرض تقرير {monthLabel}
        </button>
      </section>

      {!report ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center text-sm font-bold text-slate-500">
          اختر الطالب والشهر ثم اضغط عرض التقرير.
        </div>
      ) : (
        <div className="space-y-6 print:space-y-3">
          <section className="rounded-2xl border border-blue-100 bg-blue-50/50 p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-2xl font-black text-slate-900">{report.student.name}</h2>
                <p className="mt-1 text-sm font-bold text-slate-600">
                  {report.student.code} | {report.group.name} | {monthLabel}
                </p>
              </div>
              {progress && <span className={'rounded-full border px-4 py-2 text-sm font-black ' + progress.tone}>{progress.label}</span>}
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
              <div className="text-xs font-bold text-slate-500">عدد الجلسات</div>
              <div className="mt-2 text-2xl font-black text-slate-900">{report.summary.totalSessions}</div>
            </div>
            <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
              <div className="text-xs font-bold text-slate-500">نسبة الحضور</div>
              <div className="mt-2 text-2xl font-black text-emerald-700">{report.summary.attendanceRate == null ? '-' : report.summary.attendanceRate + '%'}</div>
            </div>
            <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
              <div className="text-xs font-bold text-slate-500">متوسط الدرجات</div>
              <div className="mt-2 text-2xl font-black text-blue-700">{report.summary.averageScorePercentage == null ? '-' : report.summary.averageScorePercentage + '%'}</div>
            </div>
            <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
              <div className="text-xs font-bold text-slate-500">عدد المتابعات</div>
              <div className="mt-2 text-2xl font-black text-slate-900">{report.summary.academicFollowUps}</div>
            </div>
            <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
              <div className="text-xs font-bold text-slate-500">تحتاج متابعة</div>
              <div className="mt-2 text-2xl font-black text-amber-700">
                {(report.summary.results.NOT_IMPROVED || 0) + (report.summary.results.NEEDS_MORE_WORK || 0)}
              </div>
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <h3 className="mb-4 flex items-center gap-2 text-lg font-black text-slate-900">
                <CalendarDays className="h-5 w-5 text-emerald-600" />
                ملخص الحضور
              </h3>
              <div className="grid grid-cols-2 gap-3 text-sm font-bold">
                {[
                  ['حاضر', report.summary.attendance.PRESENT, 'text-emerald-700'],
                  ['غائب', report.summary.attendance.ABSENT, 'text-red-700'],
                  ['متأخر', report.summary.attendance.LATE, 'text-amber-700'],
                  ['بعذر', report.summary.attendance.EXCUSED, 'text-slate-700'],
                ].map(([label, value, tone]) => (
                  <div key={label} className="rounded-xl bg-slate-50 p-3">
                    <div className="text-slate-500">{label}</div>
                    <div className={'mt-1 text-xl font-black ' + tone}>{value}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <h3 className="mb-4 text-lg font-black text-slate-900">أهم نقاط الصعوبة</h3>
              {report.summary.mainDifficulties.length === 0 ? (
                <p className="text-sm font-bold text-slate-500">لم يتم تسجيل أخطاء متكررة في هذا الشهر.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {report.summary.mainDifficulties.map((item) => (
                    <span key={item.label} className="rounded-full border border-amber-100 bg-amber-50 px-3 py-2 text-sm font-black text-amber-800">
                      {item.label} ({item.count})
                    </span>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <h3 className="mb-5 flex items-center gap-2 text-lg font-black text-slate-900">
              <BookOpenCheck className="h-5 w-5 text-blue-600" />
              مستوى الطالب جلسة بجلسة
            </h3>
            <div className="space-y-4">
              {report.sessions.length === 0 ? (
                <p className="rounded-xl bg-slate-50 p-5 text-sm font-bold text-slate-500">لا توجد جلسات لهذا الطالب في الشهر المحدد.</p>
              ) : (
                report.sessions.map((session, index) => (
                  <article key={session.id} className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="font-black text-slate-900">الجلسة {index + 1}: {session.title || report.group.name}</div>
                        <div className="mt-1 text-xs font-bold text-slate-500">
                          {new Date(session.date).toLocaleDateString('ar-EG')}
                        </div>
                      </div>
                      <span className={'inline-flex w-fit rounded-full border px-3 py-1 text-xs font-black ' + statusTone(session.attendance?.status)}>
                        {attendanceLabel(session.attendance?.status)}
                      </span>
                    </div>

                    {session.attendance?.notes && (
                      <p className="mt-3 rounded-lg bg-white p-3 text-xs font-semibold text-slate-600">ملاحظة الحضور: {session.attendance.notes}</p>
                    )}

                    {session.academicFollowUps.length === 0 ? (
                      <p className="mt-3 text-sm font-bold text-slate-500">لم يتم تسجيل متابعة أكاديمية في هذه الجلسة.</p>
                    ) : (
                      <div className="mt-3 space-y-3">
                        {session.academicFollowUps.map((entry) => (
                          <div key={entry.id} className="rounded-lg border border-blue-100 bg-white p-3">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <div className="text-sm font-black text-slate-800">
                                {activityLabel(entry.activityType)}
                                {entry.score != null && entry.maxScore != null ? ' | الدرجة: ' + entry.score + ' / ' + entry.maxScore : ''}
                              </div>
                              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">{resultLabel(entry.result)}</span>
                            </div>
                            <div className="mt-3 grid gap-2 text-xs font-semibold text-slate-600 sm:grid-cols-2">
                              {entry.questionType && <div>نوع السؤال: {entry.questionType}</div>}
                              {entry.errorType && <div>نوع الخطأ: {entry.errorType}</div>}
                              {entry.errorReason && <div>سبب الخطأ: {entry.errorReason}</div>}
                              {entry.correction && <div>التصحيح: {entry.correction}</div>}
                              {entry.assistantAction && <div>إجراء المساعد: {entry.assistantAction}</div>}
                              {entry.notes && <div>ملاحظات: {entry.notes}</div>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                ))
              )}
            </div>

            {report.unlinkedAcademicFollowUps.length > 0 && (
              <div className="mt-5 rounded-xl border border-amber-100 bg-amber-50/50 p-4">
                <h4 className="font-black text-amber-900">متابعات مسجلة خارج حصة محددة</h4>
                <div className="mt-3 space-y-2 text-sm font-semibold text-amber-900">
                  {report.unlinkedAcademicFollowUps.map((entry) => (
                    <div key={entry.id}>
                      {new Date(entry.entryDate).toLocaleDateString('ar-EG')} | {activityLabel(entry.activityType)} | {resultLabel(entry.result)}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
