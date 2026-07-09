'use client';

import React from 'react';
import api from '@/lib/axios';
import {
  AlertCircle,
  CheckCircle2,
  FileSearch,
  ImageUp,
  Loader2,
  Plus,
  RotateCw,
  Save,
  Trash2,
  Users,
} from 'lucide-react';

type ImportRow = {
  id: string;
  studentName: string;
  groupName: string;
  year: number;
  month: number;
  sessionsCount: number;
  sessionPrice: number;
  dueAmount: number;
  paidAmount: number;
  possibleSibling?: boolean;
  confidence?: number;
  rawText?: string;
};

type AnalysisSummary = {
  confidence?: number;
  rows?: number;
  groups?: number;
  warnings?: number;
};

type AnalysisRow = Partial<Omit<ImportRow, 'id'>>;

const money = new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 0 });

const inferSessionsFromGroup = (groupName: string) => {
  const normalized = groupName.replace(/\s+/g, '').replace(/%/g, '&');
  if (normalized.includes('9&10')) return 8;
  if (normalized.includes('11&12')) return 12;
  return undefined;
};

const makeRow = (defaults?: Partial<ImportRow>): ImportRow => {
  const sessionsCount = defaults?.sessionsCount ?? inferSessionsFromGroup(defaults?.groupName || '') ?? 8;
  const sessionPrice = defaults?.sessionPrice ?? 250;
  return {
    id: crypto.randomUUID(),
    studentName: '',
    groupName: '',
    year: 2025,
    month: 2,
    sessionsCount,
    sessionPrice,
    dueAmount: sessionsCount * sessionPrice,
    paidAmount: 0,
    ...defaults,
  };
};

const getErrorMessage = (err: unknown, fallback: string) => {
  if (typeof err === 'object' && err && 'response' in err) {
    const response = (err as { response?: { data?: { error?: string; message?: string } } }).response;
    return response?.data?.error || response?.data?.message || fallback;
  }
  return fallback;
};

export default function ScreenshotImportPage() {
  const [imageUrl, setImageUrl] = React.useState('');
  const [imageName, setImageName] = React.useState('');
  const [imageFile, setImageFile] = React.useState<File | null>(null);
  const [defaultYear, setDefaultYear] = React.useState(2025);
  const [defaultMonth, setDefaultMonth] = React.useState(2);
  const [defaultSessionPrice, setDefaultSessionPrice] = React.useState(250);
  const [rows, setRows] = React.useState<ImportRow[]>([makeRow()]);
  const [analysisSummary, setAnalysisSummary] = React.useState<AnalysisSummary | null>(null);
  const [warnings, setWarnings] = React.useState<string[]>([]);
  const [analyzing, setAnalyzing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  const validRows = rows.filter((row) => row.studentName.trim() && row.groupName.trim());
  const totals = validRows.reduce(
    (acc, row) => {
      acc.students.add(row.studentName.trim());
      acc.groups.add(row.groupName.trim());
      acc.due += Number(row.dueAmount || row.sessionsCount * row.sessionPrice || 0);
      acc.paid += Number(row.paidAmount || 0);
      return acc;
    },
    { students: new Set<string>(), groups: new Set<string>(), due: 0, paid: 0 },
  );

  const groupSummary = Object.values(
    validRows.reduce<Record<string, { groupName: string; students: number; due: number; paid: number }>>((acc, row) => {
      const key = row.groupName.trim();
      if (!acc[key]) acc[key] = { groupName: key, students: 0, due: 0, paid: 0 };
      acc[key].students += 1;
      acc[key].due += Number(row.dueAmount || row.sessionsCount * row.sessionPrice || 0);
      acc[key].paid += Number(row.paidAmount || 0);
      return acc;
    }, {}),
  );

  const setRow = (id: string, patch: Partial<ImportRow>) => {
    setRows((current) =>
      current.map((row) => {
        if (row.id !== id) return row;
        const next = { ...row, ...patch };
        if ('groupName' in patch && !('sessionsCount' in patch)) {
          next.sessionsCount = inferSessionsFromGroup(next.groupName) ?? next.sessionsCount;
        }
        if ('sessionsCount' in patch || 'sessionPrice' in patch) {
          next.dueAmount = Number(next.sessionsCount || 0) * Number(next.sessionPrice || 0);
        }
        return next;
      }),
    );
  };

  const addRow = () => {
    setRows((current) => [
      ...current,
      makeRow({ year: defaultYear, month: defaultMonth, sessionPrice: defaultSessionPrice }),
    ]);
  };

  const duplicateRow = (row: ImportRow) => {
    setRows((current) => [
      ...current,
      makeRow({
        ...row,
        id: crypto.randomUUID(),
        studentName: '',
        paidAmount: 0,
        confidence: undefined,
        rawText: undefined,
      }),
    ]);
  };

  const analyzeImage = async (file = imageFile) => {
    if (!file) {
      setError('اختار صورة الحسابات الأول.');
      return;
    }

    setAnalyzing(true);
    setError('');
    setMessage('');
    setWarnings([]);
    setAnalysisSummary(null);

    try {
      const form = new FormData();
      form.append('file', file);
      form.append('year', String(defaultYear));
      form.append('month', String(defaultMonth));
      form.append('sessionPrice', String(defaultSessionPrice));

      const response = await api.post('/accounting/imports/screenshot/analyze', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const result = response.data?.data?.result || response.data?.result;
      const analyzedRows = (result?.rows || []).map((row: AnalysisRow) =>
        makeRow({
          studentName: row.studentName || '',
          groupName: row.groupName || '',
          year: Number(row.year || defaultYear),
          month: Number(row.month || defaultMonth),
          sessionsCount: Number(row.sessionsCount || inferSessionsFromGroup(row.groupName || '') || 8),
          sessionPrice: Number(row.sessionPrice || defaultSessionPrice),
          dueAmount: Number(row.dueAmount || 0),
          paidAmount: Number(row.paidAmount || 0),
          possibleSibling: Boolean(row.possibleSibling),
          confidence: row.confidence === undefined ? undefined : Number(row.confidence),
          rawText: row.rawText,
        }),
      );

      setRows(analyzedRows.length ? analyzedRows : [makeRow({ year: defaultYear, month: defaultMonth, sessionPrice: defaultSessionPrice })]);
      setWarnings(result?.warnings || []);
      setAnalysisSummary({
        confidence: result?.confidence,
        rows: result?.summary?.rows || analyzedRows.length,
        groups: result?.summary?.groups || 0,
        warnings: result?.summary?.warnings || 0,
      });
      setMessage(
        analyzedRows.length
          ? `تم تحليل الصورة وقراءة ${analyzedRows.length} صف. راجع الجدول قبل التسجيل.`
          : 'تم تحليل الصورة لكن لم أتعرف على صفوف واضحة. أدخل البيانات يدويًا أو ارفع صورة أوضح.',
      );
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'فشل تحليل الصورة.'));
    } finally {
      setAnalyzing(false);
    }
  };

  const handleImage = (file?: File) => {
    if (!file) return;
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageUrl(URL.createObjectURL(file));
    setImageName(file.name);
    setImageFile(file);
    analyzeImage(file);
  };

  const handleSave = async () => {
    if (!validRows.length) {
      setError('اكتب طالب واحد على الأقل قبل التسجيل.');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');
    try {
      const payload = {
        sourceName: imageName || 'screenshot',
        rows: validRows.map((row) => ({
          studentName: row.studentName,
          groupName: row.groupName,
          year: row.year,
          month: row.month,
          sessionsCount: row.sessionsCount,
          sessionPrice: row.sessionPrice,
          dueAmount: row.dueAmount,
          paidAmount: row.paidAmount,
        })),
      };
      const response = await api.post('/accounting/imports/screenshot/confirm', payload);
      const result = response.data?.data?.result || response.data?.result;
      setMessage(
        `تم التسجيل: ${result.students} طالب، ${result.groups} جروب، ${result.periods} شهر، ${result.charges} مستحق جديد، ${result.updatedCharges || 0} مستحق محدث، ${result.payments} دفعة.`,
      );
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'فشل تسجيل البيانات.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 p-6" dir="rtl">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900">رفع وتحليل صورة حسابات</h1>
            <p className="mt-1 text-sm text-slate-500">
              ارفع صورة الجدول، راجع التحليل، عدل الطلاب والجروبات والمبالغ، ثم أكد التسجيل.
            </p>
          </div>
          <FileSearch className="h-10 w-10 text-emerald-600" />
        </header>

        <section className="grid gap-5 lg:grid-cols-[420px_1fr]">
          <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="grid grid-cols-3 gap-3">
              <label className="text-xs font-bold text-slate-600">
                السنة
                <input
                  type="number"
                  value={defaultYear}
                  onChange={(event) => setDefaultYear(Number(event.target.value))}
                  className="mt-1 w-full rounded-md border border-slate-200 px-2 py-2 text-sm"
                />
              </label>
              <label className="text-xs font-bold text-slate-600">
                الشهر
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={defaultMonth}
                  onChange={(event) => setDefaultMonth(Number(event.target.value))}
                  className="mt-1 w-full rounded-md border border-slate-200 px-2 py-2 text-sm"
                />
              </label>
              <label className="text-xs font-bold text-slate-600">
                سعر الحصة
                <input
                  type="number"
                  value={defaultSessionPrice}
                  onChange={(event) => setDefaultSessionPrice(Number(event.target.value))}
                  className="mt-1 w-full rounded-md border border-slate-200 px-2 py-2 text-sm"
                />
              </label>
            </div>

            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-5">
              <ImageUp className="h-7 w-7 text-slate-500" />
              <div>
                <div className="font-black text-slate-800">{imageName || 'اختار صورة أو Screenshot'}</div>
                <div className="text-xs text-slate-500">PNG أو JPG أو JPEG، والتحليل يبدأ تلقائيًا</div>
              </div>
              <input
                type="file"
                accept="image/png,image/jpeg,image/jpg"
                className="hidden"
                onChange={(event) => handleImage(event.target.files?.[0])}
              />
            </label>

            <button
              type="button"
              onClick={() => analyzeImage()}
              disabled={!imageFile || analyzing}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
              تحليل الصورة مرة أخرى
            </button>

            <div className="aspect-[3/4] overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="صورة الحسابات" className="h-full w-full object-contain" />
              ) : (
                <div className="flex h-full items-center justify-center px-8 text-center text-sm font-bold text-slate-400">
                  الصورة ستظهر هنا أثناء التحليل والمراجعة.
                </div>
              )}
            </div>

            {analysisSummary && (
              <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-900">
                <div className="font-black">نتيجة التحليل</div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                  <span>صفوف: {analysisSummary.rows || 0}</span>
                  <span>جروبات: {analysisSummary.groups || 0}</span>
                  <span>ثقة: {analysisSummary.confidence || 0}%</span>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              {[
                ['طلاب', totals.students.size],
                ['جروبات', totals.groups.size],
                ['المطلوب', money.format(totals.due)],
                ['المدفوع', money.format(totals.paid)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="text-xs font-bold text-slate-500">{label}</div>
                  <div className="mt-2 text-2xl font-black text-slate-900">{value}</div>
                </div>
              ))}
            </div>

            {warnings.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <div className="mb-2 flex items-center gap-2 font-black">
                  <AlertCircle className="h-4 w-4" />
                  ملاحظات تحتاج مراجعة
                </div>
                <ul className="space-y-1">
                  {warnings.slice(0, 6).map((warning, index) => (
                    <li key={`${warning}-${index}`}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="flex items-center gap-2 font-black text-slate-900">
                  <Users className="h-5 w-5 text-emerald-600" />
                  الطلاب والجروبات بعد التحليل
                </h2>
                <button
                  onClick={addRow}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700"
                >
                  <Plus className="h-4 w-4" />
                  إضافة طالب
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[1120px] text-sm">
                  <thead className="bg-slate-100 text-slate-600">
                    <tr>
                      <th className="px-2 py-2 text-right">اسم الطالب</th>
                      <th className="px-2 py-2 text-right">الجروب</th>
                      <th className="px-2 py-2 text-right">السنة</th>
                      <th className="px-2 py-2 text-right">الشهر</th>
                      <th className="px-2 py-2 text-right">الحصص</th>
                      <th className="px-2 py-2 text-right">سعر الحصة</th>
                      <th className="px-2 py-2 text-right">المطلوب</th>
                      <th className="px-2 py-2 text-right">المدفوع</th>
                      <th className="px-2 py-2 text-right">ثقة</th>
                      <th className="px-2 py-2 text-right">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} className={`border-t border-slate-100 ${row.possibleSibling ? 'bg-amber-50/60' : ''}`}>
                        <td className="px-2 py-2">
                          <input
                            value={row.studentName}
                            onChange={(event) => setRow(row.id, { studentName: event.target.value })}
                            title={row.rawText || undefined}
                            className="w-full rounded-md border border-slate-200 px-2 py-2 outline-none focus:border-emerald-500"
                          />
                          {row.possibleSibling && <div className="mt-1 text-[11px] font-bold text-amber-700">راجع صف الأخوات</div>}
                        </td>
                        <td className="px-2 py-2">
                          <input
                            value={row.groupName}
                            onChange={(event) => setRow(row.id, { groupName: event.target.value })}
                            className="w-full rounded-md border border-slate-200 px-2 py-2 outline-none focus:border-emerald-500"
                          />
                        </td>
                        {(['year', 'month', 'sessionsCount', 'sessionPrice', 'dueAmount', 'paidAmount'] as const).map((field) => (
                          <td key={field} className="px-2 py-2">
                            <input
                              type="number"
                              value={row[field]}
                              onChange={(event) => setRow(row.id, { [field]: Number(event.target.value) } as Partial<ImportRow>)}
                              className="w-full rounded-md border border-slate-200 px-2 py-2 outline-none focus:border-emerald-500"
                            />
                          </td>
                        ))}
                        <td className="px-2 py-2 text-center text-xs font-bold text-slate-500">
                          {row.confidence === undefined ? '-' : `${row.confidence}%`}
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex gap-2">
                            <button
                              onClick={() => duplicateRow(row)}
                              className="rounded-md border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                              title="تكرار"
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))}
                              className="rounded-md border border-red-200 p-2 text-red-600 hover:bg-red-50"
                              title="حذف"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 font-black text-slate-900">ملخص الجروبات</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100 text-slate-600">
                    <tr>
                      <th className="px-3 py-2 text-right">الجروب</th>
                      <th className="px-3 py-2 text-right">عدد الطلاب</th>
                      <th className="px-3 py-2 text-right">مطلوب منه</th>
                      <th className="px-3 py-2 text-right">دفع</th>
                      <th className="px-3 py-2 text-right">المتبقي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupSummary.map((group) => (
                      <tr key={group.groupName} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-bold">{group.groupName}</td>
                        <td className="px-3 py-2">{group.students}</td>
                        <td className="px-3 py-2">{money.format(group.due)}</td>
                        <td className="px-3 py-2">{money.format(group.paid)}</td>
                        <td className="px-3 py-2">{money.format(group.due - group.paid)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</div>}
            {message && (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                {message}
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={handleSave}
                disabled={saving || analyzing}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-6 py-3 font-bold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                تأكيد التسجيل
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
