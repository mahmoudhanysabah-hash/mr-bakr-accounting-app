import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AcademicFollowUpEntry, Prisma, TeachingSessionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GroupAcademicReportQueryDto, StudentAcademicReportQueryDto } from './dto/teaching.dto';
import {
  lessonSelect, lessonTime, isConfirmedAttendance, loadEnrollments, loadTeachingScope, rosterForLesson,
  RosterEnrollment, TeachingActor,
} from './lesson-roster';
import { authorSelect, awardCounts, forEnrollment, formatAward, formatFollowUp, lessonMarks, loadAwards, SavedAward, sumAwards } from './lesson-results';

const cairoCalendar = new Intl.DateTimeFormat('en', { timeZone: 'Africa/Cairo', year: 'numeric', month: 'numeric' });

export function cairoMonthStart(year: number, month: number) {
  const utc = Date.UTC(year, month - 1, 1);
  const target = year * 12 + month;
  // Find the first instant in the requested Cairo calendar month, including DST transitions.
  let before = utc - 86400000;
  let after = utc + 86400000;
  while (after - before > 1) {
    const middle = Math.floor((before + after) / 2);
    const parts = cairoCalendar.formatToParts(new Date(middle));
    const key = Number(parts.find((part) => part.type === 'year')?.value) * 12 + Number(parts.find((part) => part.type === 'month')?.value);
    if (key < target) before = middle;
    else after = middle;
  }
  return new Date(after);
}

const inRange = (date: Date, start: Date, end: Date) => date >= start && date < end;

function overlapsMonth(enrollment: RosterEnrollment, start: Date, end: Date) {
  if (enrollment.starts_at >= end) return false;
  if (enrollment.teaching_last_session) return lessonTime(enrollment.teaching_last_session) >= start;
  return enrollment.teaching_continues_after_end || !enrollment.ends_at || enrollment.ends_at > start;
}

const academicOrder = [{ entry_date: 'desc' }, { created_at: 'desc' }, { id: 'desc' }] satisfies Prisma.AcademicFollowUpEntryOrderByWithRelationInput[];
const groupSelect = { id: true, name: true, code: true } as const;
const inGroup = <T extends { student_id: string }>(ids: string[], entries: T[]) => {
  const result = new Map(ids.map((id) => [id, [] as T[]]));
  for (const entry of entries) result.get(entry.student_id)?.push(entry);
  return result;
};

function activeAcademicEntries<T extends AcademicFollowUpEntry>(entries: T[]) {
  const slots = new Set(entries.flatMap((entry) => entry.sheet_slot ? [entry.sheet_slot] : []));
  return entries.filter((entry) => entry.sheet_slot
    ? entry.score != null || !!entry.notes || !!entry.error_type
    : !slots.has(entry.activity_type) || !!entry.notes || !!entry.error_type || !!entry.error_reason || !!entry.correction || !!entry.assistant_action || !!entry.question_type,
  ).map((entry) => !entry.sheet_slot && slots.has(entry.activity_type)
    ? { ...entry, score: null, max_score: null }
    : entry);
}

function summarize(sessions: { attendance: { status: string } | null; entryCount: number }[], entries: AcademicFollowUpEntry[]) {
  const attendance = { PRESENT: 0, ABSENT: 0, LATE: 0, LEFT_EARLY: 0, EXCUSED: 0, OTHER: 0, UNRECORDED: 0 };
  sessions.forEach((session) => attendance[(session.attendance?.status ?? 'UNRECORDED') as keyof typeof attendance]++);
  const recorded = sessions.length - attendance.UNRECORDED;
  const scores = entries.filter((entry) => entry.score != null && Number(entry.max_score) > 0)
    .map((entry) => (Number(entry.score) / Number(entry.max_score)) * 100);
  const averageScorePercentage = scores.length ? Math.round((scores.reduce((total, value) => total + value, 0) / scores.length) * 10) / 10 : null;
  const results = { IMPROVED: 0, NOT_IMPROVED: 0, NEEDS_MORE_WORK: 0, NOT_ASSESSED: 0 };
  const difficulties = new Map<string, number>();
  for (const entry of entries) {
    results[entry.result]++;
    const label = entry.error_type?.trim() || entry.question_type?.trim();
    if (label) difficulties.set(label, (difficulties.get(label) ?? 0) + 1);
  }
  const needsSupport = results.NOT_IMPROVED + results.NEEDS_MORE_WORK > 0;
  const progressLevel = averageScorePercentage == null ? (needsSupport ? 'NEEDS_SUPPORT' : 'NO_DATA')
    : averageScorePercentage >= 85 && !needsSupport ? 'STRONG'
    : averageScorePercentage >= 70 ? 'GOOD' : averageScorePercentage >= 50 ? 'NEEDS_SUPPORT' : 'AT_RISK';
  return {
    totalSessions: sessions.length,
    sessionsWithAcademicFollowUp: sessions.filter((session) => session.entryCount).length,
    academicFollowUps: entries.length,
    attendanceRecords: recorded,
    attendanceRate: recorded ? Math.round((attendance.PRESENT + attendance.LATE) / recorded * 100) : null,
    averageScorePercentage,
    progressLevel,
    attendance,
    results,
    mainDifficulties: [...difficulties.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, 5),
  };
}

@Injectable()
export class LessonReportService {
  constructor(private readonly prisma: PrismaService) {}

  async studentReport(user: TeachingActor, query: StudentAcademicReportQueryDto) {
    const result = await this.buildReport(user, query, query.studentId);
    if (!result.reports[0]) throw new NotFoundException('الطالب مش ضمن المجموعة في الشهر ده.');
    return result.reports[0];
  }

  groupReport(user: TeachingActor, query: GroupAcademicReportQueryDto) {
    return this.buildReport(user, query);
  }

  private async buildReport(user: TeachingActor, { groupId, year, month }: GroupAcademicReportQueryDto, studentId?: string) {
    const start = cairoMonthStart(year, month);
    const end = cairoMonthStart(year + (month === 12 ? 1 : 0), month === 12 ? 1 : month + 1);
    return this.prisma.$transaction(async (db) => {
      const scope = await loadTeachingScope(db, user, groupId);
      if (studentId && !scope.manager && !scope.academic?.has(studentId)) {
        throw new ForbiddenException('مش مكلّف بالمتابعة الدراسية للطالب ده.');
      }
      const group = await db.accountingGroup.findUnique({ where: { id: groupId }, select: groupSelect });
      if (!group) throw new NotFoundException('المجموعة مش موجودة.');
      const authorizedIds = studentId ? [studentId] : scope.academic && [...scope.academic];
      const enrollments = (await loadEnrollments(db, groupId, end, authorizedIds)).filter((entry) => overlapsMonth(entry, start, end));
      const studentIds = [...new Set(enrollments.map((entry) => entry.student_id))];
      const filters = { groupId, year, month, startDate: start.toISOString(), endDate: new Date(end.getTime() - 1).toISOString() };
      const dateRange = { gte: start, lt: end };
      const [sessions, unlinked, awards] = await Promise.all([
        db.teachingSession.findMany({
          where: { group_id: groupId, session_date: dateRange, status: { not: TeachingSessionStatus.CANCELLED } },
          select: {
            ...lessonSelect,
            attendance_records: {
              where: { student_id: { in: studentIds } },
              include: { recorded_by: authorSelect, contacts: { select: { status: true }, orderBy: { created_at: 'desc' }, take: 1 } },
            },
            academic_follow_ups: {
              where: { student_id: { in: studentIds } }, include: { assistant: authorSelect }, orderBy: academicOrder,
            },
          },
          orderBy: [{ session_date: 'asc' }, { starts_at: 'asc' }, { created_at: 'asc' }, { id: 'asc' }],
        }),
        db.academicFollowUpEntry.findMany({
          where: { group_id: groupId, student_id: { in: studentIds }, session_id: null, entry_date: dateRange },
          include: { assistant: authorSelect }, orderBy: academicOrder,
        }),
        loadAwards(db, enrollments.map((entry) => entry.id), end),
      ]);
      const enrollmentByStudent = inGroup(studentIds, enrollments);
      const unlinkedByStudent = inGroup(studentIds, unlinked);
      const attendanceBySession = new Map(sessions.map((session) => [session.id, inGroup(studentIds, session.attendance_records)]));
      const academicBySession = new Map(sessions.map((session) => [session.id, inGroup(studentIds, session.academic_follow_ups)]));
      const rosters = new Map(sessions.map((session) => [session.id, rosterForLesson(enrollments, session)]));
      const awardsByEnrollment = new Map<string, SavedAward[]>();
      for (const award of awards) {
        const entries = awardsByEnrollment.get(award.enrollment_id) ?? [];
        entries.push(award);
        awardsByEnrollment.set(award.enrollment_id, entries);
      }

      const reports = studentIds.map((id) => {
        const participations = enrollmentByStudent.get(id)!;
        const student = participations[0].student;
        const allEntries: AcademicFollowUpEntry[] = [];
        const eligibleAwards = (entry: RosterEnrollment) => (awardsByEnrollment.get(entry.id) ?? []).filter((award) => awardCounts(award, entry));
        const pointsByEnrollment = participations.map((entry) => {
          const eligible = eligibleAwards(entry);
          return { enrollmentId: entry.id, startsAt: entry.starts_at, lastLessonDate: entry.teaching_last_session?.session_date ?? null,
            pointsEarned: sumAwards(eligible.filter((award) => inRange(award.session.session_date, start, end))), pointsBalance: sumAwards(eligible) };
        });
        const awardsInMonth = participations.flatMap(eligibleAwards).filter((award) => inRange(award.session.session_date, start, end));
        const byLesson = new Map<string, SavedAward[]>();
        for (const award of awardsInMonth) {
          const entries = byLesson.get(award.session_id) ?? [];
          entries.push(award);
          byLesson.set(award.session_id, entries);
        }
        const results = sessions.flatMap((session) => {
          const enrollment = rosters.get(session.id)?.get(id);
          if (!enrollment) return [];
          const saved = forEnrollment(attendanceBySession.get(session.id)?.get(id) ?? [], enrollment)[0];
          const attendance = saved && isConfirmedAttendance(saved) ? saved : undefined;
          const entries = forEnrollment(academicBySession.get(session.id)?.get(id) ?? [], enrollment);
          const activeEntries = activeAcademicEntries(entries);
          allEntries.push(...activeEntries);
          const lessonAwards = (byLesson.get(session.id) ?? []).filter((award) => award.enrollment_id === enrollment.id);
          const canReadAttendanceNotes = scope.manager || scope.attendance?.has(id);
          return [{
            id: session.id, title: session.title, date: session.session_date, status: session.status,
            attendance: attendance ? {
              status: attendance.status, minutesLate: attendance.minutes_late, leftEarlyMinutes: attendance.left_early_minutes,
              notes: canReadAttendanceNotes ? attendance.notes : null,
              recordedBy: canReadAttendanceNotes ? attendance.recorded_by?.name ?? null : null,
              guardianContactStatus: (scope.manager || scope.guardian?.has(id)) ? attendance.contacts[0]?.status ?? null : null,
            } : null,
            ...lessonMarks(entries, attendance),
            awards: lessonAwards.map(formatAward), pointsEarned: sumAwards(lessonAwards),
            entryCount: activeEntries.length,
            academicFollowUps: entries.filter((entry) => !entry.sheet_slot || entry.score != null || entry.notes || entry.error_type).map(formatFollowUp),
          }];
        });
        const standalone = (unlinkedByStudent.get(id) ?? []).filter((row) => participations.some((entry) =>
          (!row.enrollment_id || row.enrollment_id === entry.id) && row.entry_date >= entry.starts_at
          && (entry.teaching_last_session ? row.entry_date <= lessonTime(entry.teaching_last_session)
            : entry.teaching_continues_after_end || !entry.ends_at || row.entry_date < entry.ends_at),
        ));
        allEntries.push(...standalone);
        return {
          filters: { ...filters, studentId: id },
          student: { id, code: student.code, name: student.full_name, guardianName: scope.manager ? student.guardian_name : null },
          group,
          summary: { ...summarize(results, allEntries), pointsEarned: sumAwards(awardsInMonth), pointsBalance: pointsByEnrollment[0].pointsBalance },
          pointsByEnrollment,
          sessions: results,
          unlinkedAcademicFollowUps: standalone.map(formatFollowUp),
        };
      }).sort((a, b) => a.student.name.localeCompare(b.student.name, 'ar'));
      return { group, filters, reports };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 20000 });
  }
}
