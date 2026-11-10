import { AcademicActivityType, AcademicFollowUpEntry, AttendanceRecord, Prisma, TeachingSessionStatus } from '@prisma/client';
import { classworkAttendanceLabel, compareLessons, includesLesson, isConfirmedAttendance, lessonSelect, LessonRef, RosterEnrollment } from './lesson-roster';

export const authorSelect = { select: { name: true } } as const;

export function forEnrollment<T extends { student_id: string; enrollment_id?: string | null }>(
  rows: T[], enrollment: RosterEnrollment,
) {
  return rows.filter((row) => row.student_id === enrollment.student_id && (!row.enrollment_id || row.enrollment_id === enrollment.id));
}

export function gradeEntry(entries: AcademicFollowUpEntry[], type: AcademicActivityType) {
  return entries.find((entry) => entry.sheet_slot === type)
    ?? entries.find((entry) => !entry.sheet_slot && entry.activity_type === type && entry.score != null);
}

export function gradeValue(entry?: AcademicFollowUpEntry) {
  return {
    score: entry?.score == null ? null : Number(entry.score),
    maxScore: entry?.max_score == null ? null : Number(entry.max_score),
  };
}

export function lessonMarks(entries: AcademicFollowUpEntry[], attendance?: AttendanceRecord) {
  const homework = gradeValue(gradeEntry(entries, AcademicActivityType.HOMEWORK));
  const classwork = gradeValue(gradeEntry(entries, AcademicActivityType.CLASSWORK));
  return {
    homework,
    classwork: {
      ...classwork,
      attendanceLabel: classwork.score == null && attendance && isConfirmedAttendance(attendance)
        ? classworkAttendanceLabel(attendance.status)
        : null,
    },
  };
}

export function formatFollowUp(entry: AcademicFollowUpEntry & { assistant?: { name: string } | null }) {
  return {
    id: entry.id,
    entryDate: entry.entry_date,
    activityType: entry.activity_type,
    sheetSlot: entry.sheet_slot,
    ...gradeValue(entry),
    questionType: entry.question_type,
    errorType: entry.error_type,
    errorReason: entry.error_reason,
    correction: entry.correction,
    assistantAction: entry.assistant_action,
    result: entry.result,
    notes: entry.notes,
    assistantName: entry.assistant?.name ?? null,
  };
}

export function loadAwards(db: Prisma.TransactionClient, enrollmentIds: string[], end?: Date) {
  return db.teachingIncentiveAward.findMany({
    where: {
      enrollment_id: { in: enrollmentIds },
      session: end ? { session_date: { lt: end } } : undefined,
    },
    include: { session: { select: lessonSelect }, recorded_by: authorSelect },
    orderBy: [{ recorded_at: 'asc' }, { id: 'asc' }],
  });
}

export type SavedAward = Awaited<ReturnType<typeof loadAwards>>[number];

export function awardCounts(award: SavedAward, enrollment: RosterEnrollment, through?: LessonRef) {
  return award.enrollment_id === enrollment.id && award.session.status !== TeachingSessionStatus.CANCELLED
    && includesLesson(enrollment, award.session) && (!through || compareLessons(award.session, through) <= 0);
}

export function sumAwards(awards: SavedAward[]) {
  return Number(awards.reduce((sum, award) => sum.plus(award.amount), new Prisma.Decimal(0)));
}

export function formatAward(award: SavedAward) {
  return {
    id: award.id,
    amount: Number(award.amount),
    source: award.source,
    sessionId: award.session_id,
    lessonDate: award.session.session_date,
    recordedAt: award.recorded_at,
    recordedBy: award.recorded_by?.name ?? null,
  };
}
