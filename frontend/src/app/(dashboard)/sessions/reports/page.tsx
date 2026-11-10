'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, FileText, Printer, Search } from 'lucide-react';
import api from '@/lib/axios';
import { extractAuthUser } from '@/lib/auth';
import { getApiErrorMessage } from '@/lib/error';
import {
  activityLabels, attendanceLabels, attendanceText, AttendanceStatus, cairoDateText, Classwork,
  FollowUp, Grade, gradeText, numberText, SavedAward, unwrapData,
} from '@/components/teaching/lesson-shared';

type Group = { id: string; name: string; code: string; active?: boolean };
type Report = {
  student: { id: string; code: string; name: string };
  group: Group;
  summary: {
    totalSessions: number; attendanceRate: number | null; averageScorePercentage: number | null; progressLevel: string;
    attendance: Record<AttendanceStatus | 'UNRECORDED', number>;
    mainDifficulties: { label: string; count: number }[];
    pointsEarned: number; pointsBalance: number;
  };
  pointsByEnrollment: { enrollmentId: string; startsAt: string; lastLessonDate: string | null; pointsEarned: number; pointsBalance: number }[];
  sessions: {
    id: string; date: string; title: string | null; attendance: { status: AttendanceStatus; notes: string | null; recordedBy: string | null } | null;
    homework: Grade; classwork: Classwork; pointsEarned: number; awards: SavedAward[]; academicFollowUps: FollowUp[];
  }[];
  unlinkedAcademicFollowUps: FollowUp[];
};
type MonthlyGroup = { group: Group; filters: { year: number; month: number }; reports: Report[] };

const progress: Record<string, string> = {
  STRONG: 'مستوى قوي', GOOD: 'مستوى جيد', NEEDS_SUPPORT: 'يحتاج متابعة', AT_RISK: 'يحتاج خطة علاجية', NO_DATA: 'بيانات غير كافية',
};
const resultLabels: Record<string, string> = { IMPROVED: 'تحسّن', NOT_IMPROVED: 'لم يتحسّن', NEEDS_MORE_WORK: 'يحتاج شغل أكتر' };
const monthName = (year: number, month: number) => new Intl.DateTimeFormat('ar-EG', {
  year: 'numeric', month: 'long', timeZone: 'Africa/Cairo',
}).format(new Date(Date.UTC(year, month - 1, 1, 12)));
const percent = (value: number | null) => value == null ? '—' : numberText(value) + '٪';
const field = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-emerald-600 disabled:bg-slate-100';

function FollowUps({ entries }: { entries: FollowUp[] }) {
  if (!entries.length) return null;
  return (
    <ul className="mt-2 space-y-2">
      {entries.map((entry) => (
        <li key={entry.id} className="break-words rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-800 print:break-inside-avoid">
          <p className="font-bold">{activityLabels[entry.activityType] ?? 'متابعة'}{entry.sheetSlot ? '' : ' · سجل سابق'}{entry.assistantName && <> · {entry.assistantName}</>}{entry.score != null && <> · <bdi dir="ltr">{gradeText(entry)}</bdi></>}</p>
          {entry.notes && <p className="whitespace-pre-wrap">تعليق: {entry.notes}</p>}
          {entry.questionType && <p>نوع السؤال: {entry.questionType}</p>}
          {entry.errorType && <p className="whitespace-pre-wrap">الغلطات: {entry.errorType}</p>}
          {entry.errorReason && <p>السبب: {entry.errorReason}</p>}
          {entry.correction && <p>التصحيح: {entry.correction}</p>}
          {entry.assistantAction && <p>إجراء الأسيستنت: {entry.assistantAction}</p>}
          {resultLabels[entry.result] && <p>النتيجة: {resultLabels[entry.result]}</p>}
        </li>
      ))}
    </ul>
  );
}

function StudentReport({ report, month }: { report: Report; month: string }) {
  const { summary } = report;
  const counters = [
    ['المستوى', progress[summary.progressLevel]], ['متوسط الدرجات', percent(summary.averageScorePercentage)],
    ['نسبة الحضور المسجّل', percent(summary.attendanceRate)], ['درجات فاشل في الشهر', numberText(summary.pointsEarned)],
    ['رصيد الكورس لآخر الشهر', numberText(summary.pointsBalance)],
  ];
  return (
    <article className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 print:border-0 print:p-0">
      <header>
        <h2 className="text-xl font-black text-slate-900">التقرير الشهري لـ<bdi>{report.student.name}</bdi></h2>
        <p className="mt-1 text-sm font-bold text-slate-600"><bdi>{report.group.name}</bdi> · {month} · كود الطالب <bdi>{report.student.code}</bdi></p>
      </header>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5 print:grid-cols-5">
        {counters.map(([label, value]) => <div key={label} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
          <p className="text-xs font-bold text-slate-600">{label}</p><p className="mt-1 font-black text-slate-900">{value}</p>
        </div>)}
      </div>
      <div className="flex flex-wrap gap-2 text-xs font-bold text-slate-700">
        <span className="rounded-full bg-slate-100 px-3 py-1">{numberText(summary.totalSessions)} حصة</span>
        {[...Object.entries(attendanceLabels), ['UNRECORDED', 'لم يُسجَّل']].map(([key, label]) => (
          <span key={key} className="rounded-full bg-slate-100 px-3 py-1">{label}: {numberText(summary.attendance[key as keyof typeof summary.attendance] ?? 0)}</span>
        ))}
      </div>
      {summary.mainDifficulties.length > 0 && <p className="break-words text-sm font-semibold text-slate-700">
        <strong>أبرز الغلطات:</strong> {summary.mainDifficulties.map(({ label, count }) => label + ' (' + numberText(count) + ')').join('، ')}.
      </p>}
      {(report.pointsByEnrollment.length > 1 || report.pointsByEnrollment.some((entry) => entry.lastLessonDate)) && (
        <ul className="space-y-1 rounded-xl border border-slate-100 p-3 text-sm text-slate-700">
          {report.pointsByEnrollment.map((entry) => <li key={entry.enrollmentId}>
            اشتراك من {cairoDateText(entry.startsAt)}{entry.lastLessonDate && <> لحد حصة {cairoDateText(entry.lastLessonDate)}</>} · في الشهر: {numberText(entry.pointsEarned)} · الرصيد: {numberText(entry.pointsBalance)}
          </li>)}
        </ul>
      )}
      <section className="space-y-3">
        <h3 className="text-base font-black text-slate-900">تفاصيل الحصص</h3>
        {!report.sessions.length && <p className="text-sm font-semibold text-slate-500">مفيش حصص ضمن اشتراك الطالب في الشهر ده.</p>}
        {report.sessions.map((session) => (
          <div key={session.id} className="rounded-xl border border-slate-200 p-3 print:break-inside-avoid">
            <h4 className="font-black text-slate-900">{session.title || 'حصة'} · {cairoDateText(session.date)}</h4>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm font-semibold text-slate-700">
              <span>الحضور: <strong>{attendanceText(session.attendance?.status)}</strong></span>
              <span>الواجب: <strong><bdi dir="ltr">{gradeText(session.homework)}</bdi></strong></span>
              <span>الكلاس ورك: <strong><bdi dir={session.classwork.score == null ? 'auto' : 'ltr'}>{gradeText(session.classwork)}</bdi></strong></span>
              <span>درجات فاشل: <strong>{numberText(session.pointsEarned)}</strong></span>
            </div>
            {session.attendance?.notes && <p className="mt-2 break-words text-sm text-slate-700">تعليق الحضور: {session.attendance.notes}{session.attendance.recordedBy && <> · {session.attendance.recordedBy}</>}</p>}
            {session.awards.length > 0 && <ul className="mt-2 flex flex-wrap gap-2 text-xs font-bold text-emerald-800">
              {session.awards.map((award) => <li key={award.id} className="rounded-full bg-emerald-50 px-2 py-1">{numberText(award.amount)} · {activityLabels[award.source]}{award.recordedBy && <> · {award.recordedBy}</>}</li>)}
            </ul>}
            <FollowUps entries={session.academicFollowUps.filter((entry) => !entry.sheetSlot || entry.notes || entry.errorType)} />
          </div>
        ))}
      </section>
      {report.unlinkedAcademicFollowUps.length > 0 && <section>
        <h3 className="text-base font-black">متابعات خارج الحصص</h3>
        <FollowUps entries={report.unlinkedAcademicFollowUps} />
      </section>}
    </article>
  );
}

export default function StudentAcademicReportsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupId, setGroupId] = useState('');
  const cairoParts = new Intl.DateTimeFormat('en', { timeZone: 'Africa/Cairo', year: 'numeric', month: 'numeric' }).formatToParts(new Date());
  const [year, setYear] = useState(cairoParts.find((part) => part.type === 'year')?.value ?? '');
  const [month, setMonth] = useState(cairoParts.find((part) => part.type === 'month')?.value ?? '');
  const [studentId, setStudentId] = useState('');
  const [groupReport, setGroupReport] = useState<MonthlyGroup | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const selected = groupReport?.reports.find((report) => report.student.id === studentId);
  const label = groupReport ? monthName(groupReport.filters.year, groupReport.filters.month) : '';

  useEffect(() => {
    const controller = new AbortController();
    const loadPage = async () => {
      try {
        const response = await api.get('/auth/me', { signal: controller.signal });
        const user = extractAuthUser(response.data);
        let loadedGroups: Group[] = [];
        if (user?.role === 'ASSISTANT') {
          const assignments = await api.get('/teaching/assistant-groups', { signal: controller.signal });
          const academicGroups = unwrapData<{ group: Group; status: string; responsibility: string }[]>(assignments.data)
            .filter((entry) => entry.status === 'ACTIVE' && ['ACADEMIC_FOLLOW_UP', 'FULL'].includes(entry.responsibility));
          loadedGroups = [...new Map(academicGroups.map((entry) => [entry.group.id, entry.group])).values()];
        } else if (user?.role === 'ADMIN' || user?.role === 'FINANCE_MANAGER') {
          const groupsResponse = await api.get('/accounting/groups', { signal: controller.signal });
          loadedGroups = unwrapData<Group[]>(groupsResponse.data).sort((a, b) => Number(b.active !== false) - Number(a.active !== false));
        }
        if (!controller.signal.aborted) {
          setGroups(loadedGroups);
          setGroupId(loadedGroups[0]?.id ?? '');
        }
      } catch (err) {
        if (!controller.signal.aborted) setError(getApiErrorMessage(err, 'تعذّر تحميل المجموعات.'));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void loadPage();
    return () => controller.abort();
  }, []);

  const clear = () => { setGroupReport(null); setStudentId(''); setError(''); };
  const loadReport = async (event: FormEvent) => {
    event.preventDefault();
    if (!groupId || !year || !month || generating) return;
    clear();
    setGenerating(true);
    try {
      const response = await api.get('/teaching/reports/group-academic', { params: { groupId, year: Number(year), month: Number(month) } });
      setGroupReport(unwrapData<MonthlyGroup>(response.data));
    } catch (err) { setError(getApiErrorMessage(err, 'تعذّر تحميل التقارير الشهرية.')); }
    finally { setGenerating(false); }
  };

  return (
    <div dir="rtl" className="min-w-0 space-y-5 font-cairo">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 print:hidden">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black text-slate-900"><FileText className="size-6 text-blue-700" /> تقارير الطلاب الشهرية</h1>
          <p className="mt-1 text-sm font-semibold text-slate-600">اختار الجروب والشهر عشان تشوف مستوى كل طالب ودرجاته وملاحظات الأسيستنت.</p>
        </div>
        <Link href="/sessions" className="inline-flex items-center gap-2 text-sm font-bold text-blue-800 hover:underline"><ArrowRight className="size-4" /> تشغيل الحصص</Link>
      </header>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-800 print:hidden">{error}</p>}
      {loading ? <p className="p-5 text-sm font-bold text-slate-600">جاري تحميل المجموعات…</p> : !groups.length ? (
        <p className="rounded-xl bg-white p-4 text-sm font-bold text-slate-600">مفيش مجموعات متاحة لك للمتابعة الدراسية.</p>
      ) : (
        <form onSubmit={loadReport} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end print:hidden">
          <label className="block space-y-1 text-sm font-bold">الجروب
            <select value={groupId} className={field} disabled={generating} onChange={(event) => { clear(); setGroupId(event.target.value); }}>
              {groups.map((group) => <option value={group.id} key={group.id}>{group.name}{group.active === false ? ' · غير نشط' : ''}</option>)}
            </select>
          </label>
          <label className="block space-y-1 text-sm font-bold">الشهر
            <select value={month} className={field} disabled={generating} onChange={(event) => { clear(); setMonth(event.target.value); }}>
              {Array.from({ length: 12 }, (_, index) => <option value={index + 1} key={index}>
                {new Date(Date.UTC(2026, index, 1, 12)).toLocaleDateString('ar-EG', { month: 'long', timeZone: 'Africa/Cairo' })}
              </option>)}
            </select>
          </label>
          <label className="block space-y-1 text-sm font-bold">السنة
            <input required type="number" min={2000} max={2100} value={year} className={field} disabled={generating}
              onChange={(event) => { clear(); setYear(event.target.value); }} />
          </label>
          <button type="submit" disabled={generating || !groupId} className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-3 py-2.5 text-sm font-black text-white hover:bg-blue-800 disabled:opacity-50">
            <Search className="size-4" /> {generating ? 'جاري تجهيز التقارير…' : 'عرض تقارير الشهر'}
          </button>
        </form>
      )}
      {groupReport && (groupReport.reports.length ? <>
        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black"><bdi>{groupReport.group.name}</bdi> · {label}</h2>
              <p className="text-sm font-semibold text-slate-600">{numberText(groupReport.reports.length)} طالب في التقرير</p>
            </div>
            <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg border border-blue-200 px-3 py-2 text-sm font-bold text-blue-800 hover:bg-blue-50">
              <Printer className="size-4" /> {selected ? 'طباعة تقرير الطالب' : 'طباعة كل تقارير الجروب'}
            </button>
          </div>
          <label className="block max-w-md space-y-1 text-sm font-bold">عرض التقارير
            <select className={field} value={studentId} onChange={(event) => setStudentId(event.target.value)}>
              <option value="">كل طلاب الجروب</option>
              {groupReport.reports.map(({ student }) => <option key={student.id} value={student.id}>{student.name} · {student.code}</option>)}
            </select>
          </label>
          {!selected && <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[650px] text-right text-sm">
              <thead className="bg-slate-50 text-slate-600"><tr>{['الطالب', 'الحضور', 'متوسط الدرجات', 'المستوى', 'درجات فاشل في الشهر', 'رصيد الكورس'].map((heading) => <th key={heading} scope="col" className="p-3">{heading}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {groupReport.reports.map(({ student, summary }) => <tr key={student.id} className="hover:bg-slate-50">
                  <th scope="row" className="p-3"><button type="button" onClick={() => setStudentId(student.id)} className="font-bold text-blue-800 hover:underline"><bdi>{student.name}</bdi></button></th>
                  <td className="p-3">{percent(summary.attendanceRate)}</td>
                  <td className="p-3">{percent(summary.averageScorePercentage)}</td>
                  <td className="p-3">{progress[summary.progressLevel]}</td>
                  <td className="p-3">{numberText(summary.pointsEarned)}</td>
                  <td className="p-3">{numberText(summary.pointsBalance)}</td>
                </tr>)}
              </tbody>
            </table>
          </div>}
        </section>
        {selected ? <StudentReport report={selected} month={label} /> : (
          <div className="hidden print:block">
            {groupReport.reports.map((report, index) => <div key={report.student.id} className={index > 0 ? 'print:break-before-page' : ''}>
              <StudentReport report={report} month={label} />
            </div>)}
          </div>
        )}
      </> : <p className="rounded-xl bg-white p-4 text-sm font-bold text-slate-600">مفيش طلبة متاحين لك في الجروب خلال الشهر ده.</p>)}
    </div>
  );
}
