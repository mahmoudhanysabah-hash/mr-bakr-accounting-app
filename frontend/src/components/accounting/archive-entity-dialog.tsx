'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import api from '@/lib/axios';
import { getApiErrorMessage } from '@/lib/error';

type Props = {
  kind: 'student' | 'group';
  id: string;
  name: string;
  onCancel: () => void;
  onDeleted: () => void;
};

export default function ArchiveEntityDialog({ kind, id, name, onCancel, onDeleted }: Props) {
  const titleId = useId();
  const reasonId = useId();
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const label = kind === 'student' ? 'الطالب' : 'المجموعة';

  useEffect(() => { reasonRef.current?.focus(); }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || (kind === 'student' && !reason.trim())) return;
    setBusy(true);
    setError('');
    try {
      await api.delete(`/accounting/${kind === 'student' ? 'students' : 'groups'}/${encodeURIComponent(id)}`, {
        data: { reason: reason.trim() || undefined },
      });
    } catch (err) {
      setError(getApiErrorMessage(err, `تعذّر حذف ${label}. حاول مرة تانية.`));
      setBusy(false);
      return;
    }
    onDeleted();
  };

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" dir="rtl">
    <section role="dialog" aria-modal="true" aria-labelledby={titleId} className="w-full max-w-lg space-y-5 rounded-2xl bg-white p-6 shadow-xl">
      <h2 id={titleId} className="text-xl font-bold text-slate-900">حذف {label} من النظام</h2>
      <p className="break-words text-sm leading-7 text-slate-700">هتحذف «{name}» من قوائم التشغيل والاختيار في النظام. الحسابات والحضور والدرجات القديمة هتفضل محفوظة في الأرشيف، ومش هتتمسح.</p>
      <form onSubmit={submit} className="space-y-4">
        <label htmlFor={reasonId} className="block text-sm font-bold text-slate-700">سبب الحذف {kind === 'student' ? '(مطلوب)' : '(اختياري)'}</label>
        <textarea ref={reasonRef} id={reasonId} rows={3} maxLength={1000} required={kind === 'student'} disabled={busy} value={reason} onChange={(event) => setReason(event.target.value)} className="w-full rounded-xl border border-slate-300 p-3 text-sm focus:border-red-500 focus:outline-none" />
        {error && <p role="alert" className="text-sm font-bold text-red-700">{error}</p>}
        <div className="flex flex-wrap justify-end gap-3">
          <button type="button" disabled={busy} onClick={onCancel} className="rounded-xl bg-slate-100 px-5 py-3 text-sm font-bold text-slate-700 disabled:opacity-50">إلغاء</button>
          <button type="submit" disabled={busy || (kind === 'student' && !reason.trim())} className="rounded-xl bg-red-600 px-5 py-3 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50">{busy ? 'جاري الحذف...' : `تأكيد حذف ${label}`}</button>
        </div>
      </form>
    </section>
  </div>;
}
