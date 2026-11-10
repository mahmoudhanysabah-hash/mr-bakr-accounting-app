'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { ClipboardCheck, Download, ImageIcon, Plus, RefreshCw, Save, X } from 'lucide-react';
import api from '@/lib/axios';
import { getApiErrorMessage } from '@/lib/error';
import { createLessonImages, LessonImage, ShareableLesson } from './lesson-image';
import {
  activityLabels, attendanceText, AttendanceStatus, Award, AwardSource, cairoDateText, Classwork, FollowUp, Grade,
  gradeText, numberText, parseGradeNumber, SavedAward, unwrapData,
} from './lesson-shared';

type SheetRow = {
  studentId: string;
  enrollmentId: string;
  studentName: string;
  canAttendance: boolean;
  canAcademic: boolean;
  attendance: { status: AttendanceStatus | null; notes: string | null; version: string } | null;
  academic: {
    homework: Grade; classwork: Classwork; notes: string | null; mistakes: string | null; version: string;
    previousEntries: FollowUp[]; awards: SavedAward[]; pointsInLesson: number; pointsBalance: number;
  } | null;
};
type Sheet = {
  sessionId: string; group: { name: string }; title: string | null; date: string; status: string; rows: SheetRow[];
};
type GradeDraft = { score: string; maxScore: string };
type Draft = {
  status: AttendanceStatus | ''; attendanceNotes: string; homework: GradeDraft; classwork: GradeDraft;
  notes: string; mistakes: string; awards: Award[];
};
type Photo = Omit<LessonImage, 'blob'> & { url: string };

const editableStatuses: AttendanceStatus[] = ['PRESENT', 'ABSENT', 'EXCUSED', 'OTHER'];
const field = 'w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 disabled:bg-slate-100';
const subtleButton = 'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50';
const gradeDraft = (grade?: Grade): GradeDraft => ({ score: grade?.score?.toString() ?? '', maxScore: grade?.maxScore && grade.maxScore > 0 ? grade.maxScore.toString() : '' });
const baseDraft = (row: SheetRow): Draft => ({
  status: row.attendance?.status ?? '', attendanceNotes: row.attendance?.notes ?? '',
  homework: gradeDraft(row.academic?.homework), classwork: gradeDraft(row.academic?.classwork),
  notes: row.academic?.notes ?? '', mistakes: row.academic?.mistakes ?? '', awards: [],
});

function validateGrade(draft: GradeDraft, label: string): Grade {
  const score = parseGradeNumber(draft.score);
  const maxScore = parseGradeNumber(draft.maxScore);
  if (Number.isNaN(score) || Number.isNaN(maxScore) || (maxScore != null && maxScore <= 0)) {
    throw new Error(`اكتب درجة ${label} بالأرقام. الدرجة النهائية لازم تكون أكبر من صفر لو كتبتها.`);
  }
  if (score != null && maxScore != null && score > maxScore) throw new Error(`درجة ${label} أكبر من الدرجة النهائية.`);
  return { score, maxScore };
}

function rowChanges(row: SheetRow, draft: Draft) {
  const base = baseDraft(row);
  const changes = { studentId: row.studentId, enrollmentId: row.enrollmentId };
  const hasAttendance = row.attendance && (base.status !== draft.status || base.attendanceNotes !== draft.attendanceNotes);
  if (hasAttendance && (!draft.status || !editableStatuses.includes(draft.status))) throw new Error('اختار حالة الحضور من القائمة.');
  if (hasAttendance && draft.status === 'OTHER' && !draft.attendanceNotes.trim()) throw new Error('اكتب تعليق للحضور لما تختار «سبب آخر».');
  const homeworkChanged = JSON.stringify(draft.homework) !== JSON.stringify(base.homework);
  const classworkChanged = JSON.stringify(draft.classwork) !== JSON.stringify(base.classwork);
  const hasAcademic = row.academic && (homeworkChanged || classworkChanged || draft.notes !== base.notes || draft.mistakes !== base.mistakes);
  return {
    ...changes,
    ...(hasAttendance ? { attendance: {
      status: draft.status, version: row.attendance!.version,
      ...(draft.attendanceNotes !== base.attendanceNotes ? { notes: draft.attendanceNotes } : {}),
    } } : {}),
    ...(hasAcademic ? { academic: {
      version: row.academic!.version,
      ...(homeworkChanged ? { homework: validateGrade(draft.homework, 'الواجب') } : {}),
      ...(classworkChanged ? { classwork: validateGrade(draft.classwork, 'الكلاس ورك') } : {}),
      ...(draft.notes !== base.notes ? { notes: draft.notes } : {}),
      ...(draft.mistakes !== base.mistakes ? { mistakes: draft.mistakes } : {}),
    } } : {}),
    ...(draft.awards.length ? { awards: draft.awards } : {}),
  };
}

function GradeEditor({ value, label, disabled, onChange, fallback }: {
  value: GradeDraft; label: string; disabled: boolean; onChange: (grade: GradeDraft) => void; fallback?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1" dir="ltr">
        <input dir="ltr" inputMode="decimal" aria-label={`درجة ${label}`} value={value.score} placeholder="درجة" maxLength={13}
          disabled={disabled} className={`${field} min-w-0 text-center`} onChange={(event) => onChange({ ...value, score: event.target.value })} />
        <span className="text-slate-400">/</span>
        <input dir="ltr" inputMode="decimal" aria-label={`الدرجة النهائية لـ${label}`} value={value.maxScore} placeholder="من" maxLength={13}
          disabled={disabled} className={`${field} min-w-0 text-center`} onChange={(event) => onChange({ ...value, maxScore: event.target.value })} />
      </div>
      {fallback && (value.score.trim()
        ? <button type="button" className="text-xs font-bold text-blue-700 hover:underline disabled:opacity-50" disabled={disabled}
            onClick={() => onChange({ ...value, score: '' })}>رجوع لحالة الحضور</button>
        : <span className="inline-block rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-800">{fallback}</span>)}
    </div>
  );
}

function AwardEditor({ row, draft, disabled, onChange }: {
  row: SheetRow; draft: Draft; disabled: boolean; onChange: (awards: Award[]) => void;
}) {
  const [source, setSource] = useState<AwardSource>('CLASSWORK');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const add = () => {
    const number = parseGradeNumber(amount);
    if (number == null || !Number.isFinite(number) || number <= 0) {
      setError('اكتب عدد درجات أكبر من صفر.');
      return;
    }
    if (draft.awards.length >= 50) {
      setError('احفظ الإضافات الحالية قبل إضافة درجات تانية.');
      return;
    }
    onChange([...draft.awards, { id: crypto.randomUUID(), amount: number, source }]);
    setAmount('');
    setError('');
  };
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-bold text-slate-600">الحصة: {numberText(row.academic!.pointsInLesson)} · الرصيد: {numberText(row.academic!.pointsBalance)}</p>
      <div className="flex gap-1">
        <select aria-label={`مصدر درجات فاشل لـ${row.studentName}`} value={source} disabled={disabled} className={`${field} min-w-[112px]`}
          onChange={(event) => setSource(event.target.value as AwardSource)}>
          <option value="CLASSWORK">الكلاس ورك</option><option value="HOMEWORK">الواجب</option>
        </select>
        <input aria-label={`درجات فاشل لـ${row.studentName}`} inputMode="decimal" dir="ltr" value={amount} disabled={disabled}
          placeholder="٠" maxLength={13} className={`${field} min-w-0 text-center`} onChange={(event) => { setAmount(event.target.value); setError(''); }}
          onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); add(); } }} />
        <button type="button" title="إضافة للحفظ" aria-label={`إضافة درجات فاشل لـ${row.studentName}`} disabled={disabled || !amount.trim()}
          className="rounded-lg bg-emerald-600 px-2 text-white hover:bg-emerald-700 disabled:opacity-40" onClick={add}><Plus className="size-4" /></button>
      </div>
      {error && <p role="alert" className="text-xs font-bold text-red-700">{error}</p>}
      {draft.awards.length > 0 && <ul className="flex flex-wrap gap-1">
        {draft.awards.map((award) => <li key={award.id} className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-xs font-bold text-amber-900">
          {numberText(award.amount)} · {activityLabels[award.source]} · لم تُحفظ
          <button type="button" aria-label="إلغاء الإضافة" disabled={disabled} onClick={() => onChange(draft.awards.filter((item) => item.id !== award.id))}><X className="size-3" /></button>
        </li>)}
      </ul>}
      {!!row.academic?.awards.length && <details className="text-xs text-slate-600">
        <summary className="cursor-pointer font-bold text-emerald-800">الإضافات المحفوظة</summary>
        <ul className="mt-1 space-y-1">{row.academic.awards.map((award) => <li key={award.id}>{numberText(award.amount)} · {activityLabels[award.source]}{award.recordedBy ? ` · ${award.recordedBy}` : ''}</li>)}</ul>
      </details>}
    </div>
  );
}

export default function LessonSheet({ sessionId, onSaved, onDirtyChange }: {
  sessionId: string; onSaved: () => void; onDirtyChange: (dirty: boolean) => void;
}) {
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [error, setError] = useState('');
  const [errorStudent, setErrorStudent] = useState('');
  const [notice, setNotice] = useState('');
  const lastSave = useRef<{ body: string; requestId: string }>();
  const photoUrls = useRef<string[]>([]);
  const alive = useRef(true);
  const dirty = Object.keys(drafts).length > 0;
  const locked = saving || sheet?.status === 'CANCELLED';
  const path = `/teaching/sessions/${sessionId}`;

  const closePhotos = useCallback(() => {
    for (const url of photoUrls.current) URL.revokeObjectURL(url);
    photoUrls.current = [];
    setPhotos([]);
  }, []);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get(`${path}/sheet`, { signal });
      if (signal?.aborted || !alive.current) return;
      setSheet(unwrapData<Sheet>(response.data));
      setDrafts({});
      setErrorStudent('');
      setNotice('');
      lastSave.current = undefined;
      closePhotos();
    } catch (err) {
      if (!signal?.aborted && alive.current) setError(getApiErrorMessage(err, 'تعذّر فتح شيت الحصة.'));
    } finally {
      if (!signal?.aborted && alive.current) setLoading(false);
    }
  }, [closePhotos, path]);

  useEffect(() => {
    const controller = new AbortController();
    alive.current = true;
    void load(controller.signal);
    return () => {
      alive.current = false;
      controller.abort();
      for (const url of photoUrls.current) URL.revokeObjectURL(url);
      photoUrls.current = [];
    };
  }, [load]);

  useEffect(() => { onDirtyChange(dirty || saving); }, [dirty, onDirtyChange, saving]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const edit = (row: SheetRow, change: Partial<Draft>) => {
    if (locked) return;
    setNotice('');
    closePhotos();
    setDrafts((current) => {
      const base = baseDraft(row);
      const draft = { ...(current[row.studentId] ?? base), ...change };
      const next = { ...current };
      if (JSON.stringify(draft) === JSON.stringify(base)) delete next[row.studentId];
      else next[row.studentId] = draft;
      return next;
    });
  };

  const save = async () => {
    if (!sheet || locked || !dirty) return;
    setError('');
    setErrorStudent('');
    setNotice('');
    const touched = sheet.rows.filter((row) => drafts[row.studentId]);
    const rows: ReturnType<typeof rowChanges>[] = [];
    for (const row of touched) {
      try { rows.push(rowChanges(row, drafts[row.studentId])); }
      catch (err) {
        setError(`${row.studentName}: ${(err as Error).message}`);
        setErrorStudent(row.studentId);
        return;
      }
    }
    const body = JSON.stringify(rows);
    if (lastSave.current?.body !== body) lastSave.current = { body, requestId: crypto.randomUUID() };
    setSaving(true);
    try {
      const response = await api.post(`${path}/sheet`, { rows, requestId: lastSave.current.requestId });
      if (!alive.current) return;
      setSheet(unwrapData<Sheet>(response.data));
      setDrafts({});
      lastSave.current = undefined;
      setNotice('تم حفظ شيت الحصة.');
      onSaved();
    } catch (err) {
      if (!alive.current) return;
      const message = getApiErrorMessage(err, 'تعذّر الحفظ. تعديلاتك لسه موجودة، جرّب تاني.');
      const rowError = /^الصف (\d+):\s*(.*)/.exec(message);
      const row = rowError ? touched[Number(rowError[1]) - 1] : undefined;
      if (row) setErrorStudent(row.studentId);
      setError(row && rowError ? `${row.studentName}: ${rowError[2]}` : message);
    } finally { if (alive.current) setSaving(false); }
  };

  const exportImage = async () => {
    if (dirty || saving || exporting) return;
    setError('');
    setExporting(true);
    try {
      const response = await api.get(`${path}/sheet-export`);
      const saved = unwrapData<ShareableLesson>(response.data);
      if (!saved.rows.length) throw new Error('مفيش صفوف متاحة في الشيت للتنزيل.');
      const images = await createLessonImages(saved);
      if (!alive.current) return;
      closePhotos();
      const prepared = images.map(({ blob, ...image }) => ({ ...image, url: URL.createObjectURL(blob) }));
      photoUrls.current = prepared.map((image) => image.url);
      setPhotos(prepared);
    } catch (err) { if (alive.current) setError(getApiErrorMessage(err, err instanceof Error ? err.message : 'تعذّر تجهيز الصورة.')); }
    finally { if (alive.current) setExporting(false); }
  };

  return (
    <section aria-labelledby="lesson-sheet-title" className="min-w-0 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" dir="rtl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="lesson-sheet-title" className="flex items-center gap-2 text-xl font-black text-slate-900"><ClipboardCheck className="size-5 text-emerald-700" /> شيت الحصة</h2>
          {sheet && <p className="mt-1 text-sm font-bold text-slate-500">{sheet.group.name}{sheet.title ? ` · ${sheet.title}` : ''} · {cairoDateText(sheet.date)} · {numberText(sheet.rows.length)} طالب</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={subtleButton} disabled={loading || saving || exporting}
            onClick={() => { if (!dirty || window.confirm('إعادة التحميل هتلغي التعديلات اللي لسه متحفظتش. تكمل؟')) void load(); }}>
            <RefreshCw className="size-4" /> إعادة تحميل
          </button>
          <button type="button" className={subtleButton} disabled={dirty || saving || exporting || loading || !sheet?.rows.length}
            onClick={() => void exportImage()}><ImageIcon className="size-4" /> {exporting ? 'جاري تجهيز الصورة…' : 'صورة الشيت المحفوظ'}</button>
          <button type="button" onClick={() => void save()} disabled={!dirty || locked || loading || exporting}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-black text-white hover:bg-emerald-800 disabled:opacity-50"><Save className="size-4" /> {saving ? 'جاري الحفظ…' : 'حفظ الشيت'}</button>
        </div>
      </div>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-800">{error}</p>}
      {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{notice}</p>}
      {dirty && !saving && <p role="status" className="text-sm font-bold text-amber-800">عندك تعديلات في {numberText(Object.keys(drafts).length)} صف. احفظها قبل تنزيل الصورة.</p>}
      {sheet?.status === 'CANCELLED' && <p className="text-sm font-bold text-slate-600">الحصة ملغية، والبيانات المحفوظة للعرض بس.</p>}

      {loading ? <p className="p-6 text-sm font-bold text-slate-500">جاري تحميل شيت الحصة…</p> : sheet && !sheet.rows.length ? (
        <p className="rounded-xl bg-slate-50 p-4 text-sm font-semibold text-slate-600">مفيش طلبة متاحين لك في شيت الحصة. راجع توزيع الطلاب وصلاحيات الحضور أو المتابعة الدراسية.</p>
      ) : sheet && (
        <>
          <div className="max-h-[65vh] overflow-auto rounded-xl border border-slate-200" tabIndex={0} aria-label="جدول شيت الحصة">
            <table className="w-full min-w-[1030px] border-separate border-spacing-0 text-right text-sm">
              <thead className="sticky top-0 z-20 bg-slate-100 text-xs font-black text-slate-700">
                <tr>{['الطالب', 'الحضور', 'الواجب', 'الكلاس ورك', 'درجات فاشل', 'التعليقات والغلطات'].map((label, index) => (
                  <th key={label} scope="col" className={`border-b border-slate-200 px-3 py-3 ${index === 0 ? 'sticky right-0 z-10 bg-slate-100' : ''}`}>{label}</th>
                ))}</tr>
              </thead>
              <tbody>
                {sheet.rows.map((row) => {
                  const draft = drafts[row.studentId] ?? baseDraft(row);
                  const fallback = row.canAttendance
                    ? draft.status === 'ABSENT' || draft.status === 'EXCUSED' ? attendanceText(draft.status) : undefined
                    : row.academic?.classwork.attendanceLabel ? attendanceText(row.academic.classwork.attendanceLabel) : undefined;
                  const disabled = Boolean(locked || exporting);
                  const rowTone = errorStudent === row.studentId ? 'bg-red-50' : drafts[row.studentId] ? 'bg-amber-50' : 'bg-white';
                  return (
                    <tr key={row.studentId} className={`align-top ${rowTone}`}>
                      <th scope="row" className={`sticky right-0 z-10 w-[126px] break-words border-b border-l border-slate-100 p-3 font-bold text-slate-900 lg:w-[170px] ${rowTone}`}><bdi>{row.studentName}</bdi></th>
                      <td className="w-[150px] space-y-1.5 border-b border-slate-100 p-2.5">
                        {row.canAttendance ? <>
                          <select aria-label={`حضور ${row.studentName}`} value={draft.status} disabled={disabled} className={field}
                            onChange={(event) => edit(row, { status: event.target.value as Draft['status'] })}>
                            <option value="" disabled={!!row.attendance?.status}>لم يُسجَّل</option>
                            {row.attendance?.status && !editableStatuses.includes(row.attendance.status) && <option value={row.attendance.status}>{attendanceText(row.attendance.status)}</option>}
                            {editableStatuses.map((status) => <option key={status} value={status}>{attendanceText(status)}</option>)}
                          </select>
                          {(draft.status === 'OTHER' || !!draft.attendanceNotes) && <input aria-label={`تعليق حضور ${row.studentName}`} placeholder="تعليق الحضور" maxLength={1000}
                            value={draft.attendanceNotes} disabled={disabled || !draft.status || !editableStatuses.includes(draft.status)} className={field}
                            onChange={(event) => edit(row, { attendanceNotes: event.target.value })} />}
                        </> : '—'}
                      </td>
                      <td className="w-[135px] border-b border-slate-100 p-2.5">{row.canAcademic ? <GradeEditor value={draft.homework} label={`الواجب لـ${row.studentName}`} disabled={disabled} onChange={(homework) => edit(row, { homework })} /> : '—'}</td>
                      <td className="w-[135px] border-b border-slate-100 p-2.5">{row.canAcademic ? <GradeEditor value={draft.classwork} label={`الكلاس ورك لـ${row.studentName}`} disabled={disabled} onChange={(classwork) => edit(row, { classwork })} fallback={fallback} /> : '—'}</td>
                      <td className="w-[233px] border-b border-slate-100 p-2.5">{row.canAcademic ? <AwardEditor row={row} draft={draft} disabled={disabled} onChange={(awards) => edit(row, { awards })} /> : '—'}</td>
                      <td className="min-w-[210px] space-y-1.5 border-b border-slate-100 p-2.5">{row.canAcademic ? <>
                        <textarea aria-label={`تعليق المتابعة لـ${row.studentName}`} rows={1} maxLength={2000} placeholder="تعليق الأسيستنت" value={draft.notes} disabled={disabled} className={field}
                          onChange={(event) => edit(row, { notes: event.target.value })} />
                        <textarea aria-label={`الغلطات لـ${row.studentName}`} rows={1} maxLength={2000} placeholder="الغلطات" value={draft.mistakes} disabled={disabled} className={field}
                          onChange={(event) => edit(row, { mistakes: event.target.value })} />
                        {!!row.academic?.previousEntries.length && <details className="text-xs text-slate-600">
                          <summary className="cursor-pointer font-bold">المتابعات السابقة للحصة</summary>
                          {row.academic.previousEntries.map((entry) => <p key={entry.id} className="mt-1 break-words">{activityLabels[entry.activityType]} · {gradeText(entry)}{entry.errorType ? ` · ${entry.errorType}` : ''}{entry.notes ? ` · ${entry.notes}` : ''}</p>)}
                        </details>}
                      </> : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs font-bold text-slate-600 lg:hidden">حرّك الشيت يمين وشمال عشان تشوف باقي الأعمدة.</p>
          <p className="text-xs font-semibold text-slate-500">الدرجة الفاضية مش بتتحسب صفر. لو الطالب غايب أو معتذر، الكلاس ورك بيعرض حالة الحضور لحد ما تسجّل درجة.</p>
        </>
      )}

      {photos.length > 0 && <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-center justify-between gap-2"><p className="text-sm font-black">معاينة صورة المشاركة من الشيت المحفوظ</p>
          <button type="button" onClick={closePhotos} aria-label="إغلاق المعاينة" className={subtleButton}><X className="size-4" /></button></div>
        {photos.map((photo, index) => <div key={photo.url} className="space-y-2">
          <a href={photo.url} download={photo.name} className={subtleButton}><Download className="size-4" /> تنزيل الصورة {photos.length > 1 ? numberText(index + 1) : ''}</a>
          <div className="max-h-96 overflow-auto rounded-lg border border-slate-200 bg-white">
            <Image unoptimized src={photo.url} width={photo.width} height={photo.height} alt="صورة الحضور والدرجات المحفوظة" className="h-auto w-full min-w-[600px]" />
          </div>
        </div>)}
      </div>}
    </section>
  );
}
