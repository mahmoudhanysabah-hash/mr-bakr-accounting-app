export const attendanceLabels = {
  PRESENT: 'حضور', ABSENT: 'غياب', EXCUSED: 'اعتذار', OTHER: 'سبب آخر', LATE: 'متأخر', LEFT_EARLY: 'خرج بدري',
};

export type AttendanceStatus = keyof typeof attendanceLabels;
export type Grade = { score: number | null; maxScore: number | null };
export type Classwork = Grade & { attendanceLabel: 'ABSENT' | 'EXCUSED' | null };
export type AwardSource = 'HOMEWORK' | 'CLASSWORK';
export type Award = { id: string; amount: number; source: AwardSource };
export type SavedAward = Award & { recordedBy: string | null; lessonDate: string };
export type FollowUp = {
  id: string;
  entryDate: string;
  activityType: string;
  sheetSlot: string | null;
  score: number | null;
  maxScore: number | null;
  questionType: string | null;
  errorType: string | null;
  errorReason: string | null;
  correction: string | null;
  assistantAction: string | null;
  result: string;
  notes: string | null;
  assistantName: string | null;
};

export const activityLabels: Record<string, string> = {
  HOMEWORK: 'الواجب', CLASSWORK: 'الكلاس ورك', QUIZ: 'اختبار قصير', EXAM: 'امتحان', OTHER: 'ملاحظات الحصة',
};
export const attendanceText = (status?: AttendanceStatus | null) => status ? attendanceLabels[status] : 'لم يُسجَّل';
export const numberText = (number: number) => number.toLocaleString('ar-EG', { maximumFractionDigits: 2 });
export const cairoDateText = (date: string) => new Date(date).toLocaleDateString('ar-EG', { timeZone: 'Africa/Cairo' });
const dateKeyFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' });
export function cairoDateKey(date: Date) {
  const parts = Object.fromEntries(dateKeyFormatter.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export const gradeText = (grade: Grade | Classwork | null) => {
  if (grade?.score != null) return grade.maxScore == null ? String(grade.score) : `${grade.score} / ${grade.maxScore}`;
  if (grade && 'attendanceLabel' in grade && grade.attendanceLabel) return attendanceText(grade.attendanceLabel);
  return '—';
};

export function unwrapData<T>(payload: T | { data: T }): T {
  return 'data' in Object(payload) ? (payload as { data: T }).data : (payload as T);
}

export function parseGradeNumber(value: string) {
  const clean = value.trim().replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))).replace(/[٫,]/g, '.');
  if (!clean) return null;
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(clean)) return NaN;
  return Number(clean);
}
