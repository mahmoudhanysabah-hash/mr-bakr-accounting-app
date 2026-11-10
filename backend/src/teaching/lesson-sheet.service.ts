import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AcademicActivityType, AcademicFollowUpEntry, AttendanceRecord, AttendanceStatus, Prisma, TeachingSessionStatus } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RemoveTeachingEnrollmentDto, SaveLessonSheetDto } from './dto/lesson-sheet.dto';
import {
  compareLessons, enrollmentSelect, includesLesson, isConfirmedAttendance, isTeachingManager, lessonSelect,
  lessonTime, loadEnrollments, loadTeachingScope, rosterForLesson, TeachingActor,
} from './lesson-roster';
import { authorSelect, awardCounts, forEnrollment, formatAward, formatFollowUp, gradeEntry, gradeValue, lessonMarks, loadAwards, sumAwards } from './lesson-results';

const groupSelect = { id: true, name: true, code: true } as const;
const saveAction = 'TEACHING_SHEET_SAVED';
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const attendanceVersion = (record?: AttendanceRecord) => record ? hash(record) : '';
const academicVersion = (entries: AcademicFollowUpEntry[]) => entries.length ? hash(entries.map(({ assistant: _assistant, ...entry }: AcademicFollowUpEntry & { assistant?: unknown }) => entry)) : '';
const academicOrder = [{ entry_date: 'desc' }, { created_at: 'desc' }, { id: 'desc' }] satisfies Prisma.AcademicFollowUpEntryOrderByWithRelationInput[];

@Injectable()
export class LessonSheetService {
  constructor(private readonly prisma: PrismaService) {}

  private async findLesson(db: Prisma.TransactionClient, id: string) {
    const lesson = await db.teachingSession.findUnique({ where: { id }, select: { ...lessonSelect, group: { select: groupSelect } } });
    if (!lesson) throw new NotFoundException('الحصة مش موجودة.');
    return lesson;
  }

  async getSheet(sessionId: string, user: TeachingActor) {
    return this.prisma.$transaction(async (db) => {
      const lesson = await this.findLesson(db, sessionId);
      const scope = await loadTeachingScope(db, user, lesson.group_id);
      const enrollments = await loadEnrollments(db, lesson.group_id, lessonTime(lesson), scope.studentIds);
      const roster = [...rosterForLesson(enrollments, lesson).values()]
        .filter((entry) => scope.manager || scope.attendance?.has(entry.student_id) || scope.academic?.has(entry.student_id))
        .sort((a, b) => a.student.full_name.localeCompare(b.student.full_name, 'ar'));
      const rosterIds = roster.map((row) => row.student_id);
      const academicIds = roster.filter((row) => scope.manager || scope.academic?.has(row.student_id)).map((row) => row.id);
      const [attendanceRows, academicRows, awards] = await Promise.all([
        db.attendanceRecord.findMany({ where: { session_id: sessionId, student_id: { in: rosterIds } } }),
        db.academicFollowUpEntry.findMany({
          where: { session_id: sessionId, student_id: { in: roster.filter((row) => scope.manager || scope.academic?.has(row.student_id)).map((row) => row.student_id) } },
          orderBy: academicOrder,
        }),
        loadAwards(db, academicIds),
      ]);
      const rows = roster.map((enrollment) => {
        const canAttendance = scope.manager || !!scope.attendance?.has(enrollment.student_id);
        const canAcademic = scope.manager || !!scope.academic?.has(enrollment.student_id);
        const attendance = forEnrollment(attendanceRows, enrollment)[0];
        const confirmed = attendance && isConfirmedAttendance(attendance) ? attendance : undefined;
        const entries = forEnrollment(academicRows, enrollment);
        const observation = entries.find((entry) => entry.sheet_slot === AcademicActivityType.OTHER);
        const balance = awards.filter((award) => awardCounts(award, enrollment, lesson));
        const sessionAwards = balance.filter((award) => award.session_id === sessionId);
        return {
          studentId: enrollment.student_id,
          enrollmentId: enrollment.id,
          studentName: enrollment.student.full_name,
          canAttendance,
          canAcademic,
          attendance: canAttendance ? {
            status: confirmed?.status ?? null,
            notes: confirmed?.notes ?? null,
            version: attendanceVersion(attendance),
          } : null,
          academic: canAcademic ? {
            ...lessonMarks(entries, confirmed),
            notes: observation?.notes ?? null,
            mistakes: observation?.error_type ?? null,
            version: academicVersion(entries),
            previousEntries: entries.filter((entry) => !entry.sheet_slot).map(formatFollowUp),
            awards: sessionAwards.map(formatAward),
            pointsInLesson: sumAwards(sessionAwards),
            pointsBalance: sumAwards(balance),
          } : null,
        };
      });
      return {
        sessionId,
        group: lesson.group,
        title: lesson.title,
        date: lesson.session_date,
        status: lesson.status,
        canManageRoster: scope.manager,
        rows,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 10000 });
  }

  async getShareableSheet(sessionId: string, user: TeachingActor) {
    const { group, title, date, rows } = await this.getSheet(sessionId, user);
    return {
      groupName: group.name,
      title,
      date,
      hasAttendance: rows.some((row) => row.canAttendance),
      hasAcademic: rows.some((row) => row.canAcademic),
      rows: rows.map((row) => ({
        name: row.studentName,
        canAttendance: row.canAttendance,
        attendance: row.attendance?.status ?? null,
        homework: row.academic?.homework ?? null,
        classwork: row.academic?.classwork ?? null,
        points: row.academic?.pointsInLesson ?? null,
      })),
    };
  }

  async saveSheet(sessionId: string, dto: SaveLessonSheetDto, user: TeachingActor) {
    const fingerprint = hash(dto.rows);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.prisma.$transaction(async (db) => {
          const lesson = await this.findLesson(db, sessionId);
          const scope = await loadTeachingScope(db, user, lesson.group_id);
          const prior = await db.auditLog.findUnique({ where: { id: dto.requestId } });
          if (prior) {
            if (prior.action !== saveAction || prior.entity_id !== sessionId || prior.user_id !== user.id
              || JSON.parse(prior.payload_json ?? '{}').fingerprint !== fingerprint) {
              throw new ConflictException('معرّف الحفظ مستخدم في عملية تانية.');
            }
            return;
          }
          if (lesson.status === TeachingSessionStatus.CANCELLED) throw new BadRequestException('الحصة ملغية ومش متاح تعديل الشيت.');

          const studentIds = dto.rows.map((row) => row.studentId);
          const awardIds = dto.rows.flatMap((row) => row.awards?.map((award) => award.id) ?? []);
          if (new Set(studentIds).size !== studentIds.length || new Set(awardIds).size !== awardIds.length) {
            throw new BadRequestException('فيه صف أو إضافة درجات مكررة في نفس الحفظ.');
          }
          const roster = rosterForLesson(await loadEnrollments(db, lesson.group_id, lessonTime(lesson), studentIds), lesson);
          const [savedAttendance, savedAcademic, savedAwards] = await Promise.all([
            db.attendanceRecord.findMany({ where: { session_id: sessionId, student_id: { in: dto.rows.filter((row) => row.attendance).map((row) => row.studentId) } } }),
            db.academicFollowUpEntry.findMany({
              where: { session_id: sessionId, student_id: { in: dto.rows.filter((row) => row.academic).map((row) => row.studentId) } },
              orderBy: academicOrder,
            }),
            db.teachingIncentiveAward.findMany({ where: { id: { in: awardIds } } }),
          ]);
          const newAwards: Prisma.TeachingIncentiveAwardCreateManyInput[] = [];
          const changes: object[] = [];
          for (const [index, row] of dto.rows.entries()) {
            const label = `الصف ${index + 1}`;
            if (row.attendance && !scope.manager && !scope.attendance?.has(row.studentId)) throw new ForbiddenException(`${label}: مش مكلّف بحضور الطالب ده.`);
            if ((row.academic || row.awards?.length) && !scope.manager && !scope.academic?.has(row.studentId)) throw new ForbiddenException(`${label}: مش مكلّف بمتابعة درجات الطالب ده.`);
            const enrollment = roster.get(row.studentId);
            if (!enrollment || enrollment.id !== row.enrollmentId) throw new ConflictException(`${label}: قائمة الطلبة اتغيّرت. افتح الشيت من جديد.`);
            if (!row.attendance && !row.academic && !row.awards?.length) throw new BadRequestException(`${label}: مفيش تعديل للحفظ.`);

            if (row.attendance) {
              const previous = savedAttendance.find((entry) => entry.student_id === row.studentId);
              if (attendanceVersion(previous) !== row.attendance.version || (previous?.enrollment_id && previous.enrollment_id !== enrollment.id)) {
                throw new ConflictException(`${label}: الحضور اتغيّر من وقت ما فتحت الشيت.`);
              }
              const notes = row.attendance.notes === undefined ? previous?.notes ?? null : row.attendance.notes?.trim() || null;
              if (row.attendance.status === AttendanceStatus.OTHER && !notes) {
                throw new BadRequestException(`${label}: اكتب تعليق للحضور لما تختار «سبب آخر».`);
              }
              const now = new Date();
              const data = { status: row.attendance.status, notes, recorded_by_id: user.id, recorded_at: now, confirmed_at: now, enrollment_id: enrollment.id };
              await db.attendanceRecord.upsert({
                where: { session_id_student_id: { session_id: sessionId, student_id: row.studentId } },
                create: { ...data, session_id: sessionId, group_id: lesson.group_id, student_id: row.studentId },
                update: data,
              });
              changes.push({ studentId: row.studentId, field: 'attendance', from: previous && isConfirmedAttendance(previous) ? previous.status : null, to: data.status });
            }

            if (row.academic) {
              const entries = forEnrollment(savedAcademic, enrollment);
              if (academicVersion(entries) !== row.academic.version || savedAcademic.some((entry) => entry.student_id === row.studentId && entry.sheet_slot && entry.enrollment_id && entry.enrollment_id !== enrollment.id)) {
                throw new ConflictException(`${label}: الدرجات أو التعليقات اتغيّرت من وقت ما فتحت الشيت.`);
              }
              const saveEntry = (slot: AcademicActivityType, data: {
                score?: number | null; max_score?: number | null; notes?: string | null; error_type?: string | null;
              }) => db.academicFollowUpEntry.upsert({
                where: { session_id_student_id_sheet_slot: { session_id: sessionId, student_id: row.studentId, sheet_slot: slot } },
                create: { ...data, session_id: sessionId, student_id: row.studentId, group_id: lesson.group_id, enrollment_id: enrollment.id,
                  activity_type: slot, sheet_slot: slot, assistant_id: user.id, entry_date: lesson.session_date },
                update: { ...data, assistant_id: user.id },
              });
              for (const [slot, grade, field] of [
                [AcademicActivityType.HOMEWORK, row.academic.homework, 'الواجب'],
                [AcademicActivityType.CLASSWORK, row.academic.classwork, 'الكلاس ورك'],
              ] as const) {
                if (!grade) continue;
                if (grade.score != null && grade.maxScore != null && grade.score > grade.maxScore) {
                  throw new BadRequestException(`${label}: درجة ${field} أكبر من الدرجة النهائية.`);
                }
                const previous = gradeEntry(entries, slot);
                await saveEntry(slot, { score: grade.score, max_score: grade.maxScore });
                changes.push({ studentId: row.studentId, field: slot, from: gradeValue(previous), to: grade });
              }
              if (row.academic.notes !== undefined || row.academic.mistakes !== undefined) {
                await saveEntry(AcademicActivityType.OTHER, {
                  notes: row.academic.notes === undefined ? undefined : row.academic.notes?.trim() || null,
                  error_type: row.academic.mistakes === undefined ? undefined : row.academic.mistakes?.trim() || null,
                });
                changes.push({ studentId: row.studentId, field: 'observation' });
              }
            }

            for (const award of row.awards ?? []) {
              const saved = savedAwards.find((entry) => entry.id === award.id);
              if (saved) {
                if (saved.session_id !== sessionId || saved.enrollment_id !== enrollment.id || saved.recorded_by_id !== user.id
                  || saved.source !== award.source || Number(saved.amount) !== award.amount) {
                  throw new ConflictException(`${label}: معرّف إضافة درجات فاشل مستخدم قبل كده.`);
                }
                continue;
              }
              newAwards.push({ ...award, session_id: sessionId, enrollment_id: enrollment.id, recorded_by_id: user.id });
            }
          }
          if (newAwards.length) await db.teachingIncentiveAward.createMany({ data: newAwards });
          await db.auditLog.create({ data: {
            id: dto.requestId, user_id: user.id, action: saveAction, entity: 'teaching_session', entity_id: sessionId,
            payload_json: JSON.stringify({ fingerprint, changes, awards: newAwards.map((award) => award.id) }),
          } });
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 });
        return this.getSheet(sessionId, user);
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || !['P2034', 'P2002'].includes(error.code)) throw error;
      }
    }
    throw new ConflictException('كان فيه تعديل في نفس الوقت. جرّب الحفظ تاني.');
  }

  async manageRoster(groupId: string, user: TeachingActor) {
    this.requireManager(user);
    const [enrollments, lessons] = await Promise.all([
      loadEnrollments(this.prisma, groupId),
      this.prisma.teachingSession.findMany({ where: { group_id: groupId, status: { not: TeachingSessionStatus.CANCELLED } }, select: lessonSelect }),
    ]);
    return {
      enrollments: enrollments.map((row) => ({
        id: row.id, studentName: row.student.full_name, studentCode: row.student.code,
        startsAt: row.starts_at, endsAt: row.ends_at, continues: row.teaching_continues_after_end,
        removedAt: row.teaching_removed_at, reason: row.teaching_removal_reason, removedBy: row.teaching_removed_by?.name,
        lastSession: row.teaching_last_session,
      })),
      lessons: lessons.sort(compareLessons).reverse(),
    };
  }

  async removeEnrollment(enrollmentId: string, dto: RemoveTeachingEnrollmentDto, user: TeachingActor) {
    this.requireManager(user);
    const reason = dto.reason.trim();
    if (!reason) throw new BadRequestException('اكتب سبب خروج الطالب من الشيت.');
    return this.prisma.$transaction(async (db) => {
      const enrollment = await db.studentEnrollment.findUnique({ where: { id: enrollmentId }, select: enrollmentSelect });
      if (!enrollment) throw new NotFoundException('اشتراك الطالب مش موجود.');
      if (enrollment.teaching_removed_at) {
        if (enrollment.teaching_last_session?.id === dto.lastSessionId && enrollment.teaching_removal_reason === reason) return { removed: true };
        throw new ConflictException('آخر حصة للطالب متسجّلة بالفعل.');
      }
      const lesson = await this.findLesson(db, dto.lastSessionId);
      if (lesson.status === TeachingSessionStatus.CANCELLED || !includesLesson(enrollment, lesson)) {
        throw new BadRequestException('اختار حصة غير ملغية من فترة وجود الطالب في نفس المجموعة.');
      }
      const updated = await db.studentEnrollment.updateMany({
        where: { id: enrollmentId, teaching_removed_at: null },
        data: { teaching_removed_at: new Date(), teaching_removed_by_id: user.id, teaching_removal_reason: reason, teaching_last_session_id: lesson.id },
      });
      if (updated.count !== 1) throw new ConflictException('حد تاني سجّل خروج الطالب من الشيت.');
      await db.auditLog.create({ data: {
        user_id: user.id, action: 'TEACHING_ROSTER_REMOVED', entity: 'student_enrollment', entity_id: enrollmentId,
        payload_json: JSON.stringify({ lastSessionId: lesson.id }),
      } });
      return { removed: true };
    });
  }

  async getHistory(enrollmentId: string, user: TeachingActor) {
    this.requireManager(user);
    const enrollment = await this.prisma.studentEnrollment.findUnique({ where: { id: enrollmentId }, select: enrollmentSelect });
    if (!enrollment) throw new NotFoundException('اشتراك الطالب مش موجود.');
    const { student_id, group_id } = enrollment;
    const next = await this.prisma.studentEnrollment.findFirst({
      where: { student_id, group_id, starts_at: { gt: enrollment.starts_at } }, orderBy: { starts_at: 'asc' }, select: { starts_at: true },
    });
    const dateRange = { gte: enrollment.starts_at, lt: next?.starts_at };
    const [attendance, academic, awards] = await Promise.all([
      this.prisma.attendanceRecord.findMany({
        where: { student_id, group_id, OR: [{ enrollment_id: enrollment.id }, { enrollment_id: null, session: { session_date: dateRange } }] },
        include: { session: { select: lessonSelect }, recorded_by: authorSelect },
        orderBy: { session: { session_date: 'asc' } },
      }),
      this.prisma.academicFollowUpEntry.findMany({
        where: { student_id, group_id, OR: [{ enrollment_id: enrollment.id }, { enrollment_id: null, entry_date: dateRange }] },
        include: { session: { select: lessonSelect }, assistant: authorSelect },
        orderBy: academicOrder,
      }),
      loadAwards(this.prisma, [enrollment.id]),
    ]);
    const excluded = (lesson: Parameters<typeof includesLesson>[1]) => !includesLesson(enrollment, lesson) || lesson.status === TeachingSessionStatus.CANCELLED;
    return {
      attendance: attendance.map((row) => ({ id: row.id, date: row.session.session_date, status: row.status, confirmed: isConfirmedAttendance(row),
        notes: row.notes, recordedBy: row.recorded_by?.name, excluded: excluded(row.session) })),
      academic: academic.map((row) => ({ ...formatFollowUp(row), date: row.session?.session_date ?? row.entry_date,
        excluded: row.session ? excluded(row.session) : !!enrollment.teaching_last_session && row.entry_date > lessonTime(enrollment.teaching_last_session) })),
      awards: awards.map((row) => ({ ...formatAward(row), excluded: excluded(row.session) })),
    };
  }

  private requireManager(user: TeachingActor) {
    if (!isTeachingManager(user)) throw new ForbiddenException('إدارة قائمة الحصص وسجل الخروج متاحة للإدارة بس.');
  }
}
