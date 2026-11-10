import { ForbiddenException } from '@nestjs/common';
import { AssistantResponsibility, AttendanceStatus, Prisma, Role } from '@prisma/client';

export type TeachingActor = { id: string; role: Role };
export const isTeachingManager = (user: TeachingActor) =>
  user?.role === Role.ADMIN || user?.role === Role.FINANCE_MANAGER;

export const lessonSelect = {
  id: true,
  group_id: true,
  title: true,
  session_date: true,
  starts_at: true,
  created_at: true,
  status: true,
} satisfies Prisma.TeachingSessionSelect;

export type LessonRef = Prisma.TeachingSessionGetPayload<{ select: typeof lessonSelect }>;

export const enrollmentSelect = {
  id: true,
  student_id: true,
  group_id: true,
  starts_at: true,
  ends_at: true,
  teaching_continues_after_end: true,
  teaching_removed_at: true,
  teaching_removal_reason: true,
  teaching_last_session: { select: lessonSelect },
  teaching_removed_by: { select: { name: true } },
  student: { select: { id: true, full_name: true, code: true, guardian_name: true } },
} satisfies Prisma.StudentEnrollmentSelect;

export type RosterEnrollment = Prisma.StudentEnrollmentGetPayload<{ select: typeof enrollmentSelect }>;

export const lessonTime = (lesson: LessonRef) => lesson.starts_at ?? lesson.session_date;

export function compareLessons(left: LessonRef, right: LessonRef) {
  return lessonTime(left).getTime() - lessonTime(right).getTime()
    || left.created_at.getTime() - right.created_at.getTime()
    || left.id.localeCompare(right.id);
}

export function includesLesson(enrollment: RosterEnrollment, lesson: LessonRef) {
  const time = lessonTime(lesson);
  if (enrollment.group_id !== lesson.group_id || enrollment.starts_at > time) return false;
  if (enrollment.teaching_last_session) return compareLessons(lesson, enrollment.teaching_last_session) <= 0;
  return enrollment.teaching_continues_after_end || !enrollment.ends_at || time < enrollment.ends_at;
}

// Enrollments are ordered newest first. A return to the same group is a new participation.
export function rosterForLesson(enrollments: RosterEnrollment[], lesson: LessonRef) {
  const roster = new Map<string, RosterEnrollment>();
  for (const enrollment of enrollments) {
    if (!roster.has(enrollment.student_id) && includesLesson(enrollment, lesson)) {
      roster.set(enrollment.student_id, enrollment);
    }
  }
  return roster;
}

export function loadEnrollments(db: Prisma.TransactionClient, groupId: string, until?: Date, studentIds?: string[]) {
  return db.studentEnrollment.findMany({
    where: {
      group_id: groupId,
      starts_at: until ? { lte: until } : undefined,
      student_id: studentIds ? { in: studentIds } : undefined,
    },
    select: enrollmentSelect,
    orderBy: [{ starts_at: 'desc' }, { created_at: 'desc' }, { id: 'desc' }],
  });
}

export async function loadTeachingScope(db: Prisma.TransactionClient, user: TeachingActor, groupId: string) {
  if (isTeachingManager(user)) {
    return { manager: true, attendance: undefined, academic: undefined, guardian: undefined, studentIds: undefined };
  }
  if (user?.role !== Role.ASSISTANT) throw new ForbiddenException('مش مسموح لك بفتح تشغيل الحصص.');
  const assignment = { assistant_id: user.id, group_id: groupId, status: 'ACTIVE' as const };
  const groups = await db.assistantGroupAssignment.findMany({ where: assignment, select: { responsibility: true } });
  if (!groups.length) throw new ForbiddenException('المجموعة دي مش ضمن المجموعات المكلّف بيها.');
  const students = await db.assistantStudentAssignment.findMany({
    where: assignment,
    select: { student_id: true, responsibility: true },
  });
  const assignedFor = (responsibility: AssistantResponsibility) => {
    const matches = (value: AssistantResponsibility) => value === responsibility || value === AssistantResponsibility.FULL;
    return new Set(groups.some((group) => matches(group.responsibility))
      ? students.filter((student) => matches(student.responsibility)).map((student) => student.student_id)
      : []);
  };
  const attendance = assignedFor(AssistantResponsibility.ATTENDANCE);
  const academic = assignedFor(AssistantResponsibility.ACADEMIC_FOLLOW_UP);
  const guardian = assignedFor(AssistantResponsibility.GUARDIAN_CONTACT);
  return { manager: false, attendance, academic, guardian, studentIds: [...new Set([...attendance, ...academic, ...guardian])] };
}

// Older lessons pre-created ABSENT rows without a recorder. Keep them in history,
// but don't count them as marked until an actual attendance action is saved.
export const confirmedAttendanceWhere = {
  OR: [{ status: { not: AttendanceStatus.ABSENT } }, { confirmed_at: { not: null } }, { recorded_by_id: { not: null } }],
} satisfies Prisma.AttendanceRecordWhereInput;

export function isConfirmedAttendance(record: { status: AttendanceStatus; confirmed_at?: Date | null; recorded_by_id?: string | null }) {
  return record.status !== AttendanceStatus.ABSENT || Boolean(record.confirmed_at || record.recorded_by_id);
}

export function classworkAttendanceLabel(status: AttendanceStatus | null | undefined) {
  return status === AttendanceStatus.ABSENT || status === AttendanceStatus.EXCUSED ? status : null;
}
