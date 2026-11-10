'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CalendarClock, Clock3, RefreshCw } from 'lucide-react';
import api from '@/lib/axios';
import { numberText, unwrapData } from './lesson-shared';

export type ScheduledLesson = {
  id: string;
  title: string | null;
  group: { id: string; name: string; code: string };
  date: string;
  startsAt: string | null;
  status: string;
  assistants: string[];
  sheetState: 'SAVED' | 'UNRECORDED' | 'NOT_VISIBLE';
};

type Schedule = { day: string; lessons: ScheduledLesson[] };
const dayLabel = new Intl.DateTimeFormat('ar-EG', { timeZone: 'Africa/Cairo', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const timeLabel = new Intl.DateTimeFormat('ar-EG', { timeZone: 'Africa/Cairo', hour: 'numeric', minute: '2-digit' });
const actionStyle = 'inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-black text-emerald-800 hover:bg-emerald-50';

function statusBadge(lesson: ScheduledLesson) {
  if (lesson.status === 'CANCELLED') return { label: 'حصة ملغية', style: 'bg-red-50 text-red-800' };
  if (lesson.sheetState === 'SAVED') return { label: 'فيه تسجيل محفوظ', style: 'bg-emerald-50 text-emerald-800' };
  if (lesson.sheetState === 'NOT_VISIBLE') return { label: 'عرض المتابعة', style: 'bg-blue-50 text-blue-800' };
  return { label: 'لم يبدأ التسجيل', style: 'bg-slate-100 text-slate-700' };
}

export default function TodayLessonSchedule({ onOpen, activeId, refreshKey = 0 }: {
  onOpen?: (lesson: ScheduledLesson) => void;
  activeId?: string;
  refreshKey?: number;
}) {
  const [result, setResult] = useState<Schedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);
    api.get('/teaching/schedule/today', { signal: controller.signal })
      .then((response) => { if (!controller.signal.aborted) setResult(unwrapData<Schedule>(response.data)); })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [refreshKey, retry]);

  return (
    <section id="today-lessons" aria-labelledby="today-lessons-title" className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" dir="rtl">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-5">
        <div>
          <h2 id="today-lessons-title" className="flex items-center gap-2 text-lg font-black text-slate-900">
            <CalendarClock className="size-5 text-emerald-700" aria-hidden="true" /> جدول حصص اليوم
          </h2>
          {result && !failed && <p className="mt-1 text-xs font-bold text-slate-500">{dayLabel.format(new Date(`${result.day}T12:00:00Z`))} · بتوقيت القاهرة</p>}
        </div>
        {result && !failed && <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{numberText(result.lessons.length)} حصة</span>}
      </header>
      {failed ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 text-sm font-bold text-slate-700 sm:px-5">
          تعذّر تحميل جدول الحصص دلوقتي.
          <button type="button" onClick={() => setRetry((value) => value + 1)} className={actionStyle}><RefreshCw className="size-4" aria-hidden="true" /> إعادة المحاولة</button>
        </div>
      ) : !result && loading ? (
        <p role="status" className="px-4 py-5 text-sm font-semibold text-slate-600 sm:px-5">جاري تحميل حصص اليوم…</p>
      ) : result?.lessons.length ? (
        <ul className="divide-y divide-slate-100" aria-busy={loading}>
          {result.lessons.map((lesson) => {
            const badge = statusBadge(lesson);
            const text = lesson.sheetState === 'NOT_VISIBLE' ? 'فتح الحصة' : lesson.status === 'CANCELLED' ? 'عرض الشيت' : 'فتح الشيت';
            const label = `${text} — ${lesson.group.name}${lesson.title ? `، ${lesson.title}` : ''}${lesson.startsAt ? `، ${timeLabel.format(new Date(lesson.startsAt))}` : ''}`;
            const content = <>{text} <ArrowLeft className="size-3.5" aria-hidden="true" /></>;
            return (
              <li key={lesson.id} className={`grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-3 sm:grid-cols-[6.2rem_minmax(0,1fr)_auto_auto] sm:gap-4 sm:px-5 ${activeId === lesson.id ? 'bg-emerald-50/50' : ''}`}>
                <div className="col-start-1 row-start-1 flex min-w-0 items-center gap-1 text-xs font-black tabular-nums text-slate-700 sm:col-auto sm:row-auto">
                  <Clock3 className="hidden size-4 shrink-0 text-slate-400 sm:block" aria-hidden="true" />
                  {lesson.startsAt ? <time dateTime={lesson.startsAt}>{timeLabel.format(new Date(lesson.startsAt))}</time> : <span>بدون ميعاد</span>}
                </div>
                <div className="col-start-1 row-start-2 min-w-0 sm:col-auto sm:row-auto">
                  <p className="break-words text-sm font-black text-slate-900"><bdi>{lesson.group.name}</bdi></p>
                  <p className="break-words text-xs font-semibold text-slate-600">
                    {lesson.title && <><bdi>{lesson.title}</bdi> · </>}
                    {lesson.assistants.length ? <>الأسيستنت: {lesson.assistants.map((name, index) => <span key={`${name}:${index}`}>{index > 0 && '، '}<bdi>{name}</bdi></span>)}</> : 'الأسيستنت مش متحدد'}
                  </p>
                </div>
                <span className={`col-start-1 row-start-3 w-fit rounded-md px-2 py-1 text-[11px] font-bold sm:col-auto sm:row-auto ${badge.style}`}>{badge.label}</span>
                <div className="col-start-2 row-span-3 row-start-1 sm:col-auto sm:row-auto sm:row-span-1">
                  {onOpen ? <button type="button" className={actionStyle} aria-label={label} onClick={() => onOpen(lesson)}>{content}</button>
                    : <Link className={actionStyle} aria-label={label} prefetch={false} href={`/sessions?lesson=${encodeURIComponent(lesson.id)}`}>{content}</Link>}
                </div>
              </li>
            );
          })}
        </ul>
      ) : <p className="px-4 py-5 text-sm font-semibold text-slate-600 sm:px-5">مفيش حصص مسجّلة النهارده في الجروبات المتاحة لك.</p>}
    </section>
  );
}
