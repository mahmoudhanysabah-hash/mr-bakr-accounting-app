import { ForbiddenException, Injectable } from '@nestjs/common';
import { AssistantAssignmentStatus, AssistantResponsibility, Prisma, Role, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { cairoDateKey, cairoDayRange } from './cairo-calendar';
import { confirmedAttendanceWhere, enrollmentSelect, isTeachingManager, lessonSelect, lessonTime, rosterForLesson, TeachingActor } from './lesson-roster';

const { ATTENDANCE, ACADEMIC_FOLLOW_UP, FULL } = AssistantResponsibility;
const groupSelect = { id: true, name: true, code: true } as const;
const assignmentSelect = { group_id: true, responsibility: true, assistant: { select: { id: true, name: true } } } as const;
const isFor = (actual: AssistantResponsibility, task: AssistantResponsibility) => actual === FULL || actual === task;

@Injectable()
export class TodayLessonService {
  constructor(private readonly prisma: PrismaService) {}

  async getToday(user: TeachingActor, now = new Date()) {
    const manager = isTeachingManager(user);
    if (!manager && user?.role !== Role.ASSISTANT) throw new ForbiddenException('مش مسموح لك بفتح تشغيل الحصص.');
    const day = cairoDateKey(now);
    const dayRange = cairoDayRange(day);
    const active = { status: AssistantAssignmentStatus.ACTIVE, assistant: { role: Role.ASSISTANT, status: UserStatus.ACTIVE } };

    return this.prisma.$transaction(async (db) => {
      const myGroups = manager ? [] : await db.assistantGroupAssignment.findMany({
        where: { ...active, assistant_id: user.id }, select: assignmentSelect,
      });
      if (!manager && !myGroups.length) return { day, lessons: [] };
      const lessons = await db.teachingSession.findMany({
        where: { session_date: dayRange, group_id: manager ? undefined : { in: [...new Set(myGroups.map((entry) => entry.group_id))] } },
        select: { ...lessonSelect, group: { select: groupSelect }, attendance_assistant_id: true, academic_assistant_id: true },
        orderBy: [{ starts_at: { sort: 'asc', nulls: 'last' } }, { session_date: 'asc' }, { created_at: 'asc' }, { id: 'asc' }],
      });
      if (!lessons.length) return { day, lessons: [] };

      const groups = [...new Set(lessons.map((lesson) => lesson.group_id))];
      const sessionIds = lessons.map((lesson) => lesson.id);
      const duties = manager ? [] : await db.assistantStudentAssignment.findMany({
        where: { assistant_id: user.id, status: AssistantAssignmentStatus.ACTIVE, group_id: { in: groups } },
        select: { group_id: true, student_id: true, responsibility: true },
      });
      const allowedStudents = new Map<string, { attendance: Set<string>; academic: Set<string> }>();
      for (const id of groups) {
        const groupTasks = myGroups.filter((entry) => entry.group_id === id);
        const students = duties.filter((entry) => entry.group_id === id);
        const idsFor = (task: AssistantResponsibility) => new Set(groupTasks.some((entry) => isFor(entry.responsibility, task))
          ? students.filter((entry) => isFor(entry.responsibility, task)).map((entry) => entry.student_id) : []);
        allowedStudents.set(id, { attendance: idsFor(ATTENDANCE), academic: idsFor(ACADEMIC_FOLLOW_UP) });
      }
      const eligibleGroups = groups.map((id) => {
        const scope = allowedStudents.get(id)!;
        return { group_id: id, student_id: { in: [...new Set([...scope.attendance, ...scope.academic])] } };
      });
      const asOf = new Date(Math.max(...lessons.map((lesson) => lessonTime(lesson).getTime())));
      const [staff, enrollments, attendance, academics, awards] = await Promise.all([
        manager ? db.assistantGroupAssignment.findMany({ where: { ...active, group_id: { in: groups } }, select: assignmentSelect }) : myGroups,
        db.studentEnrollment.findMany({
          where: { group_id: { in: groups }, starts_at: { lte: asOf }, OR: manager ? undefined : eligibleGroups },
          select: enrollmentSelect, orderBy: [{ starts_at: 'desc' }, { created_at: 'desc' }, { id: 'desc' }],
        }),
        db.attendanceRecord.findMany({
          where: { session_id: { in: sessionIds }, AND: [confirmedAttendanceWhere], OR: manager ? undefined : eligibleGroups },
          select: { session_id: true, student_id: true, enrollment_id: true },
        }),
        db.academicFollowUpEntry.findMany({
          where: { session_id: { in: sessionIds }, OR: manager ? undefined : eligibleGroups,
            AND: [{ OR: [{ score: { not: null } }, { notes: { not: null } }, { error_type: { not: null } },
              { question_type: { not: null } }, { error_reason: { not: null } }, { correction: { not: null } },
              { assistant_action: { not: null } }, { result: { not: 'NOT_ASSESSED' } }] }] },
          select: { session_id: true, student_id: true, enrollment_id: true },
        }),
        db.teachingIncentiveAward.findMany({
          where: { session_id: { in: sessionIds }, enrollment: manager ? undefined : { OR: eligibleGroups } },
          select: { session_id: true, enrollment_id: true, enrollment: { select: { student_id: true } } },
        }),
      ]);
      const rosters = new Map(lessons.map((lesson) => [lesson.id, rosterForLesson(enrollments, lesson)]));
      const saved = new Set<string>();
      const checkSaved = (row: { session_id: string | null; student_id: string; enrollment_id: string | null }, task: 'attendance' | 'academic') => {
        if (!row.session_id) return;
        const enrollment = rosters.get(row.session_id)?.get(row.student_id);
        if (!enrollment || (row.enrollment_id && row.enrollment_id !== enrollment.id)) return;
        if (manager || allowedStudents.get(enrollment.group_id)?.[task].has(row.student_id)) saved.add(row.session_id);
      };
      attendance.forEach((entry) => checkSaved(entry, 'attendance'));
      academics.forEach((entry) => checkSaved(entry, 'academic'));
      awards.forEach((entry) => checkSaved({ ...entry, student_id: entry.enrollment.student_id }, 'academic'));

      return {
        day,
        lessons: lessons.map((lesson) => {
          const groupStaff = staff.filter((entry) => entry.group_id === lesson.group_id);
          const primary = groupStaff.filter((entry) => (entry.assistant.id === lesson.attendance_assistant_id && isFor(entry.responsibility, ATTENDANCE))
            || (entry.assistant.id === lesson.academic_assistant_id && isFor(entry.responsibility, ACADEMIC_FOLLOW_UP)));
          const full = groupStaff.filter((entry) => entry.responsibility === FULL);
          const sheetStaff = groupStaff.filter((entry) => entry.responsibility === ATTENDANCE || entry.responsibility === ACADEMIC_FOLLOW_UP);
          const assignees = primary.length ? primary : full.length ? full : sheetStaff.length ? sheetStaff : groupStaff;
          const scope = allowedStudents.get(lesson.group_id)!;
          const canSeeSheet = manager || [...(rosters.get(lesson.id)?.keys() ?? [])].some((id) => scope.attendance.has(id) || scope.academic.has(id));
          return {
            id: lesson.id, title: lesson.title, group: lesson.group, date: lesson.session_date, startsAt: lesson.starts_at, status: lesson.status,
            assistants: [...new Map(assignees.map(({ assistant }) => [assistant.id, assistant.name])).values()].sort((a, b) => a.localeCompare(b, 'ar')),
            sheetState: !canSeeSheet ? 'NOT_VISIBLE' : saved.has(lesson.id) ? 'SAVED' : 'UNRECORDED',
          };
        }),
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 10000 });
  }
}
