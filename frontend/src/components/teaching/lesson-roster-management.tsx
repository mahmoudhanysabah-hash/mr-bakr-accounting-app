'use client';

import { FormEvent, useEffect, useState } from 'react';
import { History, UserRoundCheck } from 'lucide-react';
import api from '@/lib/axios';
import { getApiErrorMessage } from '@/lib/error';
import { activityLabels, attendanceText, AttendanceStatus, cairoDateText, FollowUp, gradeText, numberText, SavedAward, unwrapData } from './lesson-shared';

type Lesson = { id: string; title: string | null; session_date: string; starts_at: string | null };
type Enrollment = {
  id: string; studentName: string; studentCode: string; startsAt: string; endsAt: string | null;
  continues: boolean; removedAt: string | null; reason: string | null; removedBy?: string; lastSession: Lesson | null;
};
type Roster = { enrollments: Enrollment[]; lessons: Lesson[] };
type TeachingHistory = {
  attendance: { id: string; date: string; status: AttendanceStatus; confirmed: boolean; notes: string | null; recordedBy?: string; excluded: boolean }[];
  academic: (FollowUp & { date: string; excluded: boolean })[];
  awards: (SavedAward & { excluded: boolean })[];
};

const input = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-600';

export default function LessonRosterManagement({ groupId, dirty, onSaved }: { groupId: string; dirty: boolean; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [roster, setRoster] = useState<Roster | null>(null);
  const [id, setId] = useState('');
  const [lastSessionId, setLastSessionId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<{ id: string; data: TeachingHistory } | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const path = `/teaching/groups/${groupId}/lesson-roster`;
  const enrollment = roster?.enrollments.find((entry) => entry.id === id);
  const choices = roster?.lessons.filter((lesson) => {
    if (!enrollment) return false;
    const time = new Date(lesson.starts_at ?? lesson.session_date);
    return time >= new Date(enrollment.startsAt) && (enrollment.continues || !enrollment.endsAt || time < new Date(enrollment.endsAt));
  }) ?? [];

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    api.get(path, { signal: controller.signal }).then((response) => setRoster(unwrapData<Roster>(response.data)))
      .catch((err) => { if (!controller.signal.aborted) setError(getApiErrorMessage(err, 'تعذّر تحميل قائمة المجموعة.')); });
    return () => controller.abort();
  }, [open, path]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!enrollment || busy || dirty || !lastSessionId || !reason.trim()) return;
    if (!window.confirm(`هنخلي الحصة المختارة آخر حصة لـ${enrollment.studentName} في الشيت. كل نتائجه القديمة هتفضل محفوظة. تأكد الحفظ؟`)) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api.patch(`/teaching/lesson-roster/${enrollment.id}`, { lastSessionId, reason });
      const response = await api.get(path);
      setRoster(unwrapData<Roster>(response.data));
      setHistory(null);
      setMessage('اتسجّلت آخر حصة للطالب، وسجلّه فضل محفوظ.');
      onSaved();
    } catch (err) { setError(getApiErrorMessage(err, 'تعذّر حفظ آخر حصة للطالب.')); }
    finally { setBusy(false); }
  };

  const loadHistory = async () => {
    if (!enrollment || busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await api.get(`/teaching/lesson-roster/${enrollment.id}/history`);
      setHistory({ id: enrollment.id, data: unwrapData<TeachingHistory>(response.data) });
    } catch (err) { setError(getApiErrorMessage(err, 'تعذّر تحميل سجل الطالب.')); }
    finally { setBusy(false); }
  };

  const savedHistory = history?.id === id ? history?.data : undefined;
  const excludedTag = (excluded: boolean) => excluded && <span className="mr-2 rounded bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">خارج الشيت والتقارير</span>;
  return (
    <div className="space-y-3">
      <button type="button" aria-expanded={open} onClick={() => { setOpen(!open); setError(''); }}
        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
        <UserRoundCheck className="size-4" /> آخر حصة للطالب وسجلّه
      </button>
      {open && <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs font-semibold leading-6 text-slate-600">اختار آخر حصة يظهر فيها الطالب. الحصة المختارة واللي قبلها هتفضل في الشيت والتقارير، وأي نتائج بعدها هتفضل في السجل. الإجراء ده خاص بشيت الحصص.</p>
        {error && <p role="alert" className="text-sm font-bold text-red-700">{error}</p>}
        {message && <p role="status" className="text-sm font-bold text-emerald-800">{message}</p>}
        {roster ? <>
          <label className="block space-y-1 text-sm font-bold">الطالب والاشتراك في المجموعة
            <select value={id} className={input} disabled={busy} onChange={(event) => { setId(event.target.value); setLastSessionId(''); setReason(''); setHistory(null); setMessage(''); setError(''); }}>
              <option value="">اختار طالب</option>
              {[...roster.enrollments].sort((a, b) => a.studentName.localeCompare(b.studentName, 'ar')).map((entry) =>
                <option key={entry.id} value={entry.id}>{entry.studentName} · {entry.studentCode} · من {cairoDateText(entry.startsAt)}{entry.removedAt ? ' · خرج من الشيت' : ''}</option>,
              )}
            </select>
          </label>
          {enrollment && <>
            {enrollment.removedAt && enrollment.lastSession ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
              <p className="font-bold">آخر حصة: {cairoDateText(enrollment.lastSession.session_date)}{enrollment.lastSession.title ? ` · ${enrollment.lastSession.title}` : ''}</p>
              <p className="mt-1 break-words">السبب: {enrollment.reason}</p>
              <p className="mt-1 text-xs">اتسجّل القرار يوم {cairoDateText(enrollment.removedAt)}{enrollment.removedBy ? ` بواسطة ${enrollment.removedBy}` : ''}.</p>
            </div> : <form onSubmit={save} className="space-y-2">
              <label className="block space-y-1 text-sm font-bold">آخر حصة يظهر فيها الطالب
                <select className={input} required value={lastSessionId} disabled={busy || !choices.length} onChange={(event) => setLastSessionId(event.target.value)}>
                  <option value="">{choices.length ? 'اختار الحصة' : 'مفيش حصة متاحة في فترة الاشتراك'}</option>
                  {choices.map((lesson) => <option key={lesson.id} value={lesson.id}>{cairoDateText(lesson.session_date)}{lesson.starts_at ? ` · ${new Date(lesson.starts_at).toLocaleTimeString('ar-EG', { timeZone: 'Africa/Cairo', hour: 'numeric', minute: '2-digit' })}` : ''}{lesson.title ? ` · ${lesson.title}` : ''}</option>)}
                </select>
              </label>
              <label className="block space-y-1 text-sm font-bold">سبب الخروج من الشيت
                <textarea required rows={2} className={input} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} />
              </label>
              <button type="submit" disabled={busy || dirty || !lastSessionId || !reason.trim()} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">حفظ آخر حصة</button>
              {dirty && <p className="text-xs font-bold text-amber-800">احفظ تعديلات الشيت الأول.</p>}
            </form>}
            <button type="button" onClick={() => void loadHistory()} disabled={busy} className="inline-flex items-center gap-2 text-sm font-bold text-blue-800 hover:underline disabled:opacity-50"><History className="size-4" /> عرض السجل المحفوظ</button>
          </>}
          {savedHistory && <div className="max-h-[420px] space-y-3 overflow-auto rounded-lg border border-slate-200 bg-white p-3 text-sm">
            <h3 className="font-black text-slate-900">سجل حضور ودرجات {enrollment?.studentName}</h3>
            <div><p className="font-bold">الحضور</p>
              {!savedHistory.attendance.length && <p className="text-slate-500">مفيش حضور محفوظ.</p>}
              {savedHistory.attendance.map((row) => <p key={row.id} className="break-words border-b border-slate-100 py-1">{cairoDateText(row.date)} · {row.confirmed ? attendanceText(row.status) : 'غياب قديم غير مؤكّد'}{row.recordedBy ? ` · ${row.recordedBy}` : ''}{row.notes ? ` · ${row.notes}` : ''}{excludedTag(row.excluded)}</p>)}
            </div>
            <div><p className="font-bold">الدرجات والمتابعة</p>
              {!savedHistory.academic.length && <p className="text-slate-500">مفيش درجات أو ملاحظات محفوظة.</p>}
              {savedHistory.academic.map((row) => <p key={row.id} className="break-words border-b border-slate-100 py-1">{cairoDateText(row.date)} · {activityLabels[row.activityType] ?? 'متابعة'} · {gradeText(row)}{row.assistantName ? ` · ${row.assistantName}` : ''}{row.notes ? ` · ${row.notes}` : ''}{row.errorType ? ` · الغلطات: ${row.errorType}` : ''}{row.errorReason ? ` · ${row.errorReason}` : ''}{row.correction ? ` · ${row.correction}` : ''}{excludedTag(row.excluded)}</p>)}
            </div>
            <div><p className="font-bold">درجات فاشل</p>
              {!savedHistory.awards.length && <p className="text-slate-500">مفيش إضافات محفوظة.</p>}
              {savedHistory.awards.map((row) => <p key={row.id} className="border-b border-slate-100 py-1">{cairoDateText(row.lessonDate)} · {numberText(row.amount)} · {activityLabels[row.source]}{row.recordedBy ? ` · ${row.recordedBy}` : ''}{excludedTag(row.excluded)}</p>)}
            </div>
          </div>}
        </> : !error && <p className="text-sm font-semibold text-slate-500">جاري تحميل القائمة…</p>}
      </div>}
    </div>
  );
}
