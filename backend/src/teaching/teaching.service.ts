import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AcademicImprovementStatus,
  AssistantAssignmentStatus,
  AssistantResponsibility,
  AttendanceStatus,
  GuardianContactStatus,
  Prisma,
  Role,
  TeachingSessionStatus,
  UserStatus,
} from '@prisma/client';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AssignAssistantGroupDto,
  AssignAssistantStudentsDto,
  CreateAcademicFollowUpDto,
  CreateGuardianContactDto,
  CreateTeachingSessionDto,
  UpdateAssignmentStatusDto,
  UpdateTeachingSessionStatusDto,
  UpsertAttendanceDto,
} from './dto/teaching.dto';
import { confirmedAttendanceWhere, isConfirmedAttendance, LessonRef, lessonTime, loadEnrollments, loadTeachingScope, rosterForLesson } from './lesson-roster';
import { cairoDateKey, cairoDayRange, cairoLessonStart } from './cairo-calendar';

const managerRoles = new Set<Role>([Role.ADMIN, Role.FINANCE_MANAGER]);

@Injectable()
export class TeachingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private isManager(user?: { role?: Role }) {
    return Boolean(user?.role && managerRoles.has(user.role));
  }

  private responsibilityFilter(responsibility: AssistantResponsibility) {
    return [responsibility, AssistantResponsibility.FULL];
  }

  private async ensureAssistant(assistantId: string) {
    const assistant = await this.prisma.user.findUnique({ where: { id: assistantId } });
    if (!assistant || assistant.role !== Role.ASSISTANT || assistant.status !== UserStatus.ACTIVE) {
      throw new BadRequestException('Assistant account is not active or does not exist');
    }
    return assistant;
  }

  private async ensureGroup(groupId: string) {
    const group = await this.prisma.accountingGroup.findUnique({ where: { id: groupId } });
    if (!group) {
      throw new NotFoundException('Group not found');
    }
    return group;
  }

  private async ensureStudentInGroup(studentId: string, groupId: string) {
    const enrollment = await this.prisma.studentEnrollment.findFirst({
      where: {
        student_id: studentId,
        group_id: groupId,
        status: 'ACTIVE',
        student: { status: 'ACTIVE' },
      },
      include: { student: true },
    });
    if (!enrollment) {
      throw new BadRequestException('Student is not active in this group');
    }
    return enrollment;
  }

  private async ensureGroupAccess(
    user: any,
    groupId: string,
    responsibility: AssistantResponsibility,
  ) {
    if (this.isManager(user)) {
      return;
    }
    if (user?.role !== Role.ASSISTANT) {
      throw new ForbiddenException('This action is not allowed');
    }

    const count = await this.prisma.assistantGroupAssignment.count({
      where: {
        assistant_id: user.id,
        group_id: groupId,
        status: AssistantAssignmentStatus.ACTIVE,
        responsibility: { in: this.responsibilityFilter(responsibility) },
      },
    });
    if (count === 0) {
      throw new ForbiddenException('Assistant is not assigned to this group');
    }
  }

  private async ensureStudentAccess(
    user: any,
    studentId: string,
    groupId: string,
    responsibility: AssistantResponsibility,
  ) {
    if (this.isManager(user)) {
      return;
    }
    await this.ensureGroupAccess(user, groupId, responsibility);
    const count = await this.prisma.assistantStudentAssignment.count({
      where: {
        assistant_id: user.id,
        student_id: studentId,
        group_id: groupId,
        status: AssistantAssignmentStatus.ACTIVE,
        responsibility: { in: this.responsibilityFilter(responsibility) },
      },
    });
    if (count === 0) {
      throw new ForbiddenException('Assistant is not assigned to this student');
    }
  }

  private async hasGroupResponsibility(
    assistantId: string,
    groupId: string,
    responsibility: AssistantResponsibility,
  ) {
    const count = await this.prisma.assistantGroupAssignment.count({
      where: {
        assistant_id: assistantId,
        group_id: groupId,
        status: AssistantAssignmentStatus.ACTIVE,
        responsibility: { in: this.responsibilityFilter(responsibility) },
      },
    });
    return count > 0;
  }

  private async assignedGroupIds(user: any) {
    if (this.isManager(user)) {
      return undefined;
    }
    if (user?.role !== Role.ASSISTANT) {
      return [];
    }
    const assignments = await this.prisma.assistantGroupAssignment.findMany({
      where: {
        assistant_id: user.id,
        status: AssistantAssignmentStatus.ACTIVE,
      },
      select: { group_id: true },
      distinct: ['group_id'],
    });
    return assignments.map((assignment) => assignment.group_id);
  }

  private async assignedStudentIds(
    user: any,
    groupId?: string,
    responsibility?: AssistantResponsibility,
  ) {
    if (this.isManager(user)) {
      return undefined;
    }
    if (user?.role !== Role.ASSISTANT) {
      return [];
    }
    const assignments = await this.prisma.assistantStudentAssignment.findMany({
      where: {
        assistant_id: user.id,
        group_id: groupId,
        status: AssistantAssignmentStatus.ACTIVE,
        responsibility: responsibility ? { in: this.responsibilityFilter(responsibility) } : undefined,
      },
      select: { student_id: true },
      distinct: ['student_id'],
    });
    return assignments.map((assignment) => assignment.student_id);
  }

  private userSelect() {
    return { id: true, name: true, email: true, phone: true, role: true, status: true } as const;
  }

  private async lessonRoster(lesson: LessonRef, studentIds?: string[]) {
    return rosterForLesson(await loadEnrollments(this.prisma, lesson.group_id, lessonTime(lesson), studentIds), lesson);
  }

  private attendanceRosterWhere(roster: Awaited<ReturnType<TeachingService['lessonRoster']>>): Prisma.AttendanceRecordWhereInput {
    return { OR: [...roster.values()].map((row) => ({ student_id: row.student_id, OR: [{ enrollment_id: row.id }, { enrollment_id: null }] })) };
  }

  listAssistants() {
    return this.prisma.user.findMany({
      where: { role: Role.ASSISTANT },
      select: this.userSelect(),
      orderBy: { name: 'asc' },
    });
  }

  async assignGroup(dto: AssignAssistantGroupDto, actorId?: string) {
    await this.ensureAssistant(dto.assistantId);
    await this.ensureGroup(dto.groupId);

    const assignment = await this.prisma.assistantGroupAssignment.upsert({
      where: {
        assistant_id_group_id_responsibility: {
          assistant_id: dto.assistantId,
          group_id: dto.groupId,
          responsibility: dto.responsibility,
        },
      },
      create: {
        assistant_id: dto.assistantId,
        group_id: dto.groupId,
        responsibility: dto.responsibility,
        assigned_by_id: actorId,
        starts_at: dto.startsAt ? new Date(dto.startsAt) : new Date(),
        notes: dto.notes?.trim() || null,
      },
      update: {
        status: AssistantAssignmentStatus.ACTIVE,
        assigned_by_id: actorId,
        starts_at: dto.startsAt ? new Date(dto.startsAt) : undefined,
        ends_at: null,
        notes: dto.notes?.trim() || null,
      },
      include: {
        assistant: { select: this.userSelect() },
        group: true,
      },
    });

    await this.audit.log({
      userId: actorId,
      action: 'ASSISTANT_GROUP_ASSIGNED',
      entity: 'assistant_group_assignment',
      entityId: assignment.id,
      payload: {
        assistantId: dto.assistantId,
        groupId: dto.groupId,
        responsibility: dto.responsibility,
      },
    });

    return assignment;
  }

  async listGroupAssignments(user: any, assistantId?: string, groupId?: string) {
    const scopedAssistantId = this.isManager(user) ? assistantId : user?.id;
    return this.prisma.assistantGroupAssignment.findMany({
      where: {
        assistant_id: scopedAssistantId,
        group_id: groupId,
      },
      include: {
        assistant: { select: this.userSelect() },
        group: true,
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async updateGroupAssignmentStatus(id: string, dto: UpdateAssignmentStatusDto, actorId?: string) {
    const assignment = await this.prisma.assistantGroupAssignment.update({
      where: { id },
      data: {
        status: dto.status,
        ends_at: dto.endsAt ? new Date(dto.endsAt) : dto.status === AssistantAssignmentStatus.INACTIVE ? new Date() : null,
      },
      include: {
        assistant: { select: this.userSelect() },
        group: true,
      },
    });

    await this.audit.log({
      userId: actorId,
      action: 'ASSISTANT_GROUP_ASSIGNMENT_UPDATED',
      entity: 'assistant_group_assignment',
      entityId: id,
      payload: { status: dto.status },
    });

    return assignment;
  }

  async assignStudents(dto: AssignAssistantStudentsDto, actorId?: string) {
    await this.ensureAssistant(dto.assistantId);
    await this.ensureGroup(dto.groupId);

    const enrollments = await this.prisma.studentEnrollment.findMany({
      where: {
        group_id: dto.groupId,
        status: 'ACTIVE',
        student_id: { in: dto.studentIds },
        student: { status: 'ACTIVE' },
      },
      select: { student_id: true },
    });
    const found = new Set(enrollments.map((enrollment) => enrollment.student_id));
    const missing = dto.studentIds.filter((studentId) => !found.has(studentId));
    if (missing.length > 0) {
      throw new BadRequestException('Some students are not active in this group');
    }

    await this.assignGroup(
      {
        assistantId: dto.assistantId,
        groupId: dto.groupId,
        responsibility: dto.responsibility,
        startsAt: dto.startsAt,
        notes: dto.notes,
      },
      actorId,
    );

    const assignments = await this.prisma.$transaction(
      dto.studentIds.map((studentId) =>
        this.prisma.assistantStudentAssignment.upsert({
          where: {
            assistant_id_student_id_group_id_responsibility: {
              assistant_id: dto.assistantId,
              student_id: studentId,
              group_id: dto.groupId,
              responsibility: dto.responsibility,
            },
          },
          create: {
            assistant_id: dto.assistantId,
            student_id: studentId,
            group_id: dto.groupId,
            responsibility: dto.responsibility,
            assigned_by_id: actorId,
            starts_at: dto.startsAt ? new Date(dto.startsAt) : new Date(),
            notes: dto.notes?.trim() || null,
          },
          update: {
            status: AssistantAssignmentStatus.ACTIVE,
            assigned_by_id: actorId,
            starts_at: dto.startsAt ? new Date(dto.startsAt) : undefined,
            ends_at: null,
            notes: dto.notes?.trim() || null,
          },
          include: {
            student: true,
            group: true,
            assistant: { select: this.userSelect() },
          },
        }),
      ),
    );

    await this.audit.log({
      userId: actorId,
      action: 'ASSISTANT_STUDENTS_ASSIGNED',
      entity: 'assistant_student_assignment',
      payload: {
        assistantId: dto.assistantId,
        groupId: dto.groupId,
        responsibility: dto.responsibility,
        studentsCount: dto.studentIds.length,
      },
    });

    return assignments;
  }

  async listStudentAssignments(user: any, assistantId?: string, groupId?: string) {
    const scopedAssistantId = this.isManager(user) ? assistantId : user?.id;
    return this.prisma.assistantStudentAssignment.findMany({
      where: {
        assistant_id: scopedAssistantId,
        group_id: groupId,
      },
      include: {
        assistant: { select: this.userSelect() },
        student: true,
        group: true,
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async createSession(dto: CreateTeachingSessionDto, user: any) {
    const group = await this.ensureGroup(dto.groupId);
    await this.ensureGroupAccess(user, group.id, AssistantResponsibility.ATTENDANCE);

    const actorId = user?.id;
    const createdByAssistant = user?.role === Role.ASSISTANT;
    let attendanceAssistantId = dto.attendanceAssistantId || null;
    let guardianContactAssistantId = dto.guardianContactAssistantId || null;
    let academicAssistantId = dto.academicAssistantId || null;

    if (createdByAssistant) {
      attendanceAssistantId = user.id;
      guardianContactAssistantId = (await this.hasGroupResponsibility(user.id, group.id, AssistantResponsibility.GUARDIAN_CONTACT))
        ? user.id
        : null;
      academicAssistantId = (await this.hasGroupResponsibility(user.id, group.id, AssistantResponsibility.ACADEMIC_FOLLOW_UP))
        ? user.id
        : null;
    } else {
      const assistantIds = [
        attendanceAssistantId,
        guardianContactAssistantId,
        academicAssistantId,
      ].filter(Boolean) as string[];
      for (const assistantId of assistantIds) {
        await this.ensureAssistant(assistantId);
      }
    }

    const sessionDate = new Date(dto.sessionDate);
    if (dto.startsAt && dto.startTime) throw new BadRequestException('سجّل ميعاد الحصة مرة واحدة.');
    const startsAt = dto.startTime ? cairoLessonStart(cairoDateKey(sessionDate), dto.startTime) : dto.startsAt ? new Date(dto.startsAt) : null;
    const session = await this.prisma.teachingSession.create({
      data: {
        group_id: group.id,
        title: dto.title?.trim() || null,
        session_date: sessionDate,
        starts_at: startsAt,
        ends_at: dto.endsAt ? new Date(dto.endsAt) : null,
        created_by_id: actorId,
        attendance_assistant_id: attendanceAssistantId,
        guardian_contact_assistant_id: guardianContactAssistantId,
        academic_assistant_id: academicAssistantId,
        notes: dto.notes?.trim() || null,
      },
    });

    await this.audit.log({
      userId: actorId,
      action: 'TEACHING_SESSION_CREATED',
      entity: 'teaching_session',
      entityId: session.id,
      payload: { groupId: group.id },
    });

    return this.getSession(session.id, user);
  }

  async listSessions(user: any, groupId?: string, date?: string) {
    const groupIds = await this.assignedGroupIds(user);
    if (groupIds && groupIds.length === 0) {
      return [];
    }

    const where: any = {};
    if (groupId) where.group_id = groupId;
    if (groupIds) where.group_id = { in: groupId ? groupIds.filter((id) => id === groupId) : groupIds };
    if (date) {
      const parsed = new Date(date);
      if (!Number.isFinite(parsed.getTime())) throw new BadRequestException('اختار تاريخ حصة صحيح.');
      where.session_date = cairoDayRange(/^\d{4}-\d{2}-\d{2}$/.test(date) ? date : cairoDateKey(parsed));
    }

    return this.prisma.teachingSession.findMany({
      where,
      include: {
        group: true,
        attendance_assistant: { select: this.userSelect() },
        guardian_contact_assistant: { select: this.userSelect() },
        academic_assistant: { select: this.userSelect() },
        _count: { select: { attendance_records: { where: confirmedAttendanceWhere }, guardian_contact_logs: true, academic_follow_ups: true } },
      },
      orderBy: { session_date: 'desc' },
      take: 100,
    });
  }

  async getSession(id: string, user: any) {
    const baseSession = await this.prisma.teachingSession.findUnique({ where: { id } });
    if (!baseSession) {
      throw new NotFoundException('Teaching session not found');
    }
    const scope = await loadTeachingScope(this.prisma, user, baseSession.group_id);
    const roster = await this.lessonRoster(baseSession, scope.studentIds);
    const allowed = (ids?: Set<string>) => [...roster.values()].filter((row) => scope.manager || ids?.has(row.student_id));
    const byEnrollment = (ids?: Set<string>) => ({ OR: allowed(ids).map((row) => ({ student_id: row.student_id, OR: [{ enrollment_id: row.id }, { enrollment_id: null }] })) });
    const safeStudent = { select: { id: true, code: true, full_name: true } } as const;
    const session = await this.prisma.teachingSession.findUnique({
      where: { id },
      include: {
        group: true,
        attendance_assistant: { select: this.userSelect() },
        guardian_contact_assistant: { select: this.userSelect() },
        academic_assistant: { select: this.userSelect() },
        attendance_records: {
          where: { AND: [confirmedAttendanceWhere, byEnrollment(scope.attendance)] },
          include: {
            student: safeStudent,
            recorded_by: { select: this.userSelect() },
            contacts: {
              where: { student_id: { in: allowed(scope.guardian).map((row) => row.student_id) } },
              include: { contacted_by: { select: this.userSelect() } },
              orderBy: { created_at: 'desc' },
            },
          },
          orderBy: { student: { full_name: 'asc' } },
        },
        guardian_contact_logs: {
          where: { student_id: { in: allowed(scope.guardian).map((row) => row.student_id) } },
          include: {
            student: safeStudent,
            contacted_by: { select: this.userSelect() },
          },
          orderBy: { created_at: 'desc' },
        },
        academic_follow_ups: {
          where: byEnrollment(scope.academic),
          include: {
            student: safeStudent,
            assistant: { select: this.userSelect() },
          },
          orderBy: { entry_date: 'desc' },
        },
      },
    });
    if (!session) {
      throw new NotFoundException('Teaching session not found');
    }
    return session;
  }

  async updateSessionStatus(id: string, dto: UpdateTeachingSessionStatusDto, actorId?: string) {
    const session = await this.prisma.teachingSession.update({
      where: { id },
      data: { status: dto.status },
      include: { group: true },
    });

    await this.audit.log({
      userId: actorId,
      action: 'TEACHING_SESSION_STATUS_UPDATED',
      entity: 'teaching_session',
      entityId: id,
      payload: { status: dto.status },
    });

    return session;
  }

  async upsertAttendance(sessionId: string, dto: UpsertAttendanceDto, user: any) {
    const session = await this.prisma.teachingSession.findUnique({ where: { id: sessionId } });
    if (!session) {
      throw new NotFoundException('Teaching session not found');
    }
    await this.ensureGroupAccess(user, session.group_id, AssistantResponsibility.ATTENDANCE);
    if (session.status === TeachingSessionStatus.CANCELLED) throw new BadRequestException('Teaching session is cancelled');
    const roster = await this.lessonRoster(session, dto.records.map((row) => row.studentId));

    const records = [];
    for (const row of dto.records) {
      await this.ensureStudentAccess(user, row.studentId, session.group_id, AssistantResponsibility.ATTENDANCE);
      const enrollment = roster.get(row.studentId);
      if (!enrollment) throw new BadRequestException('Student is not on the roster for this lesson');
      const previous = await this.prisma.attendanceRecord.findUnique({ where: { session_id_student_id: { session_id: sessionId, student_id: row.studentId } } });
      if (previous?.enrollment_id && previous.enrollment_id !== enrollment.id) throw new BadRequestException('Attendance belongs to another enrollment');
      const notes = row.notes === undefined ? undefined : row.notes?.trim() || null;
      if (row.status === AttendanceStatus.OTHER && !(notes === undefined ? previous?.notes : notes)) {
        throw new BadRequestException('An explanation is required for other attendance');
      }
      const now = new Date();
      records.push(
        this.prisma.attendanceRecord.upsert({
          where: {
            session_id_student_id: {
              session_id: session.id,
              student_id: row.studentId,
            },
          },
          create: {
            session_id: session.id,
            student_id: row.studentId,
            group_id: session.group_id,
            enrollment_id: enrollment.id,
            status: row.status,
            recorded_by_id: user?.id,
            confirmed_at: now,
            minutes_late: row.minutesLate ?? null,
            left_early_minutes: row.leftEarlyMinutes ?? null,
            notes,
          },
          update: {
            status: row.status,
            recorded_by_id: user?.id,
            recorded_at: now,
            confirmed_at: now,
            enrollment_id: enrollment.id,
            minutes_late: row.minutesLate,
            left_early_minutes: row.leftEarlyMinutes,
            notes,
          },
          include: {
            student: true,
            recorded_by: { select: this.userSelect() },
          },
        }),
      );
    }

    const saved = await this.prisma.$transaction(records);

    await this.audit.log({
      userId: user?.id,
      action: 'ATTENDANCE_RECORDED',
      entity: 'teaching_session',
      entityId: session.id,
      payload: { recordsCount: saved.length },
    });

    return saved;
  }

  async getAttendance(sessionId: string, user: any) {
    const session = await this.prisma.teachingSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Teaching session not found');
    await this.ensureGroupAccess(user, session.group_id, AssistantResponsibility.ATTENDANCE);
    const allowedStudentIds = await this.assignedStudentIds(user, session.group_id, AssistantResponsibility.ATTENDANCE);
    const roster = await this.lessonRoster(session, allowedStudentIds);

    return this.prisma.attendanceRecord.findMany({
      where: {
        session_id: sessionId,
        AND: [confirmedAttendanceWhere, this.attendanceRosterWhere(roster)],
      },
      include: {
        student: { select: { id: true, code: true, full_name: true } },
        recorded_by: { select: this.userSelect() },
      },
      orderBy: { student: { full_name: 'asc' } },
    });
  }

  async getAbsences(sessionId: string, user: any) {
    const session = await this.prisma.teachingSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Teaching session not found');
    await this.ensureGroupAccess(user, session.group_id, AssistantResponsibility.GUARDIAN_CONTACT);
    if (session.status === TeachingSessionStatus.CANCELLED) return [];
    const allowedStudentIds = await this.assignedStudentIds(user, session.group_id, AssistantResponsibility.GUARDIAN_CONTACT);
    const roster = await this.lessonRoster(session, allowedStudentIds);

    return this.prisma.attendanceRecord.findMany({
      where: {
        session_id: sessionId,
        status: { in: [AttendanceStatus.ABSENT, AttendanceStatus.EXCUSED] },
        AND: [confirmedAttendanceWhere, this.attendanceRosterWhere(roster)],
      },
      include: {
        student: true,
        contacts: {
          include: { contacted_by: { select: this.userSelect() } },
          orderBy: { created_at: 'desc' },
        },
      },
      orderBy: { student: { full_name: 'asc' } },
    });
  }

  async createGuardianContact(dto: CreateGuardianContactDto, user: any) {
    const session = await this.prisma.teachingSession.findUnique({ where: { id: dto.sessionId } });
    if (!session) throw new NotFoundException('Teaching session not found');
    await this.ensureGroupAccess(user, session.group_id, AssistantResponsibility.GUARDIAN_CONTACT);
    await this.ensureStudentAccess(user, dto.studentId, session.group_id, AssistantResponsibility.GUARDIAN_CONTACT);
    if (session.status === TeachingSessionStatus.CANCELLED) throw new BadRequestException('Teaching session is cancelled');

    const enrollment = (await this.lessonRoster(session, [dto.studentId])).get(dto.studentId);
    if (!enrollment) throw new BadRequestException('Student is not on the roster for this lesson');
    const [record, student] = await Promise.all([
      this.prisma.attendanceRecord.findUnique({ where: { session_id_student_id: { session_id: session.id, student_id: dto.studentId } } }),
      this.prisma.managedStudent.findUnique({ where: { id: dto.studentId }, select: { guardian_phone: true } }),
    ]);
    const attendance = record && isConfirmedAttendance(record) && (!record.enrollment_id || record.enrollment_id === enrollment.id) ? record : null;
    if (dto.attendanceId && dto.attendanceId !== attendance?.id) {
      throw new BadRequestException('Attendance record is not confirmed for this lesson and student');
    }

    const contact = await this.prisma.guardianContactLog.create({
      data: {
        attendance_id: attendance?.id ?? null,
        session_id: session.id,
        student_id: dto.studentId,
        group_id: session.group_id,
        guardian_phone: dto.guardianPhone?.trim() || student?.guardian_phone || null,
        status: dto.status,
        response: dto.response?.trim() || null,
        contacted_by_id: user?.id,
        contacted_at: dto.contactedAt ? new Date(dto.contactedAt) : new Date(),
        follow_up_at: dto.followUpAt ? new Date(dto.followUpAt) : null,
        notes: dto.notes?.trim() || null,
      },
      include: {
        student: true,
        contacted_by: { select: this.userSelect() },
      },
    });

    await this.audit.log({
      userId: user?.id,
      action: 'GUARDIAN_CONTACT_RECORDED',
      entity: 'guardian_contact_log',
      entityId: contact.id,
      payload: { sessionId: session.id, studentId: dto.studentId, status: dto.status },
    });

    return contact;
  }

  private reportDateRange(startDate?: string, endDate?: string) {
    const end = endDate ? new Date(endDate) : new Date();
    end.setHours(23, 59, 59, 999);
    const start = startDate ? new Date(startDate) : new Date(end);
    if (!startDate) {
      start.setDate(start.getDate() - 30);
    }
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }

  private emptyOperationsReport(start: Date, end: Date, groupId?: string, assistantId?: string) {
    return {
      filters: { startDate: start.toISOString(), endDate: end.toISOString(), groupId: groupId || null, assistantId: assistantId || null },
      totals: {
        sessions: 0,
        attendanceRecords: 0,
        present: 0,
        absent: 0,
        late: 0,
        leftEarly: 0,
        excused: 0,
        uncontactedAbsences: 0,
        guardianContacts: 0,
        academicFollowUps: 0,
        needsWork: 0,
      },
      groups: [],
      students: [],
      recentGuardianContacts: [],
      recentAcademicFollowUps: [],
      assistants: [],
    };
  }

  async getOperationsReport(user: any, startDate?: string, endDate?: string, groupId?: string, assistantId?: string) {
    const { start, end } = this.reportDateRange(startDate, endDate);
    const scopedGroupIds = await this.assignedGroupIds(user);
    if (scopedGroupIds && scopedGroupIds.length === 0) {
      return this.emptyOperationsReport(start, end, groupId, assistantId);
    }

    let groupFilter: string | { in: string[] } | undefined;
    if (groupId && scopedGroupIds && !scopedGroupIds.includes(groupId)) {
      return this.emptyOperationsReport(start, end, groupId, assistantId);
    }
    if (groupId) {
      groupFilter = groupId;
    } else if (scopedGroupIds) {
      groupFilter = { in: scopedGroupIds };
    }

    const sessionWhere: any = {
      session_date: { gte: start, lte: end },
      group_id: groupFilter,
    };

    const manager = this.isManager(user);
    const assignmentFilter = { assistant_id: user?.id, status: AssistantAssignmentStatus.ACTIVE, group_id: groupFilter };
    const [groupAssignments, studentAssignments] = manager ? [[], []] : await Promise.all([
      this.prisma.assistantGroupAssignment.findMany({ where: assignmentFilter, select: { group_id: true, responsibility: true } }),
      this.prisma.assistantStudentAssignment.findMany({ where: assignmentFilter, select: { group_id: true, student_id: true, responsibility: true } }),
    ]);
    if (!manager && !studentAssignments.length) {
      return this.emptyOperationsReport(start, end, groupId, assistantId);
    }
    const dutyRoster = (responsibility: AssistantResponsibility) => {
      const match = this.responsibilityFilter(responsibility);
      const groups = new Set(groupAssignments.filter((row) => match.includes(row.responsibility)).map((row) => row.group_id));
      const result = new Map<string, Set<string>>();
      for (const row of studentAssignments) {
        if (!groups.has(row.group_id) || !match.includes(row.responsibility)) continue;
        const students = result.get(row.group_id) ?? new Set<string>();
        students.add(row.student_id);
        result.set(row.group_id, students);
      }
      return result;
    };
    const whereDuty = (roster: Map<string, Set<string>>) => manager ? {} : {
      OR: [...roster].map(([group_id, ids]) => ({ group_id, student_id: { in: [...ids] } })),
    };
    const attendanceDuty = dutyRoster(AssistantResponsibility.ATTENDANCE);
    const guardianDuty = dutyRoster(AssistantResponsibility.GUARDIAN_CONTACT);
    const academicDuty = dutyRoster(AssistantResponsibility.ACADEMIC_FOLLOW_UP);
    const canReadGuardian = (groupId: string, studentId: string) => manager || !!guardianDuty.get(groupId)?.has(studentId);
    const assistantFilter = manager ? assistantId || undefined : undefined;

    const [sessions, rawAttendance, rawContacts, rawFollowUps] = await Promise.all([
      this.prisma.teachingSession.findMany({
        where: sessionWhere,
        include: { group: true },
        orderBy: { session_date: 'desc' },
      }),
      this.prisma.attendanceRecord.findMany({
        where: {
          session: sessionWhere,
          ...whereDuty(attendanceDuty),
          AND: [confirmedAttendanceWhere],
          recorded_by_id: assistantFilter,
        },
        include: {
          student: true,
          group: true,
          session: true,
          contacts: { orderBy: { created_at: 'desc' } },
          recorded_by: { select: this.userSelect() },
        },
        orderBy: { recorded_at: 'desc' },
        take: 5000,
      }),
      this.prisma.guardianContactLog.findMany({
        where: {
          session: sessionWhere,
          ...whereDuty(guardianDuty),
          contacted_by_id: assistantFilter,
        },
        include: {
          student: true,
          group: true,
          session: true,
          contacted_by: { select: this.userSelect() },
        },
        orderBy: [{ contacted_at: 'desc' }, { created_at: 'desc' }],
        take: 1000,
      }),
      this.prisma.academicFollowUpEntry.findMany({
        where: {
          entry_date: { gte: start, lte: end },
          group_id: groupFilter,
          ...whereDuty(academicDuty),
          assistant_id: assistantFilter,
        },
        include: {
          student: true,
          group: true,
          session: true,
          assistant: { select: this.userSelect() },
        },
        orderBy: { entry_date: 'desc' },
        take: 1000,
      }),
    ]);

    const includedSessions = sessions.filter((session) => session.status !== TeachingSessionStatus.CANCELLED);
    const rosterGroups = new Map(await Promise.all([...new Set(includedSessions.map((session) => session.group_id))]
      .map(async (id) => [id, await loadEnrollments(this.prisma, id)] as const)));
    const rosters = new Map(includedSessions.map((session) => [session.id, rosterForLesson(rosterGroups.get(session.group_id) ?? [], session)]));
    const isInRoster = (row: { session_id: string | null; student_id: string; enrollment_id?: string | null }) => {
      if (!row.session_id) return true;
      const enrollment = rosters.get(row.session_id)?.get(row.student_id);
      return !!enrollment && (!row.enrollment_id || row.enrollment_id === enrollment.id);
    };
    const attendanceRecords = rawAttendance.filter(isInRoster);
    const guardianContacts = rawContacts.filter(isInRoster);
    const academicFollowUps = rawFollowUps.filter(isInRoster);

    const totals = {
      sessions: includedSessions.length,
      attendanceRecords: attendanceRecords.length,
      present: 0,
      absent: 0,
      late: 0,
      leftEarly: 0,
      excused: 0,
      uncontactedAbsences: 0,
      guardianContacts: guardianContacts.length,
      academicFollowUps: academicFollowUps.length,
      needsWork: 0,
    };

    const groups = new Map<string, any>();
    const students = new Map<string, any>();
    const assistants = new Map<string, any>();

    const ensureGroup = (group: any) => {
      const current = groups.get(group.id) ?? {
        groupId: group.id,
        groupName: group.name,
        sessions: 0,
        attendanceRecords: 0,
        present: 0,
        absent: 0,
        late: 0,
        leftEarly: 0,
        excused: 0,
        uncontactedAbsences: 0,
        guardianContacts: 0,
        academicFollowUps: 0,
        needsWork: 0,
        students: new Set<string>(),
      };
      groups.set(group.id, current);
      return current;
    };

    const ensureStudent = (student: any, group: any) => {
      const current = students.get(student.id) ?? {
        studentId: student.id,
        studentName: student.full_name,
        studentCode: student.code,
        guardianPhone: canReadGuardian(group.id, student.id) ? student.guardian_phone : null,
        groupName: group.name,
        absences: 0,
        late: 0,
        uncontactedAbsences: 0,
        guardianContacts: 0,
        academicFollowUps: 0,
        needsWork: 0,
        lastAbsenceDate: null,
        lastContactStatus: null,
        lastFollowUpResult: null,
      };
      students.set(student.id, current);
      return current;
    };

    const ensureAssistant = (assistant: any) => {
      if (!assistant?.id) return null;
      const current = assistants.get(assistant.id) ?? {
        assistantId: assistant.id,
        assistantName: assistant.name,
        attendanceRecords: 0,
        guardianContacts: 0,
        academicFollowUps: 0,
      };
      assistants.set(assistant.id, current);
      return current;
    };

    includedSessions.forEach((session) => {
      const group = ensureGroup(session.group);
      group.sessions += 1;
    });

    attendanceRecords.forEach((record) => {
      const group = ensureGroup(record.group);
      const student = ensureStudent(record.student, record.group);
      const assistant = ensureAssistant(record.recorded_by);
      group.attendanceRecords += 1;
      group.students.add(record.student_id);
      if (assistant) assistant.attendanceRecords += 1;

      if (record.status === AttendanceStatus.PRESENT) {
        totals.present += 1;
        group.present += 1;
      }
      if (record.status === AttendanceStatus.ABSENT) {
        totals.absent += 1;
        group.absent += 1;
        student.absences += 1;
        student.lastAbsenceDate = record.session.session_date;
      }
      if (record.status === AttendanceStatus.LATE) {
        totals.late += 1;
        group.late += 1;
        student.late += 1;
      }
      if (record.status === AttendanceStatus.LEFT_EARLY) {
        totals.leftEarly += 1;
        group.leftEarly += 1;
      }
      if (record.status === AttendanceStatus.EXCUSED) {
        totals.excused += 1;
        group.excused += 1;
        student.absences += 1;
        student.lastAbsenceDate = record.session.session_date;
      }
      if (canReadGuardian(record.group_id, record.student_id) && (record.status === AttendanceStatus.ABSENT || record.status === AttendanceStatus.EXCUSED) && record.contacts.length === 0) {
        totals.uncontactedAbsences += 1;
        group.uncontactedAbsences += 1;
        student.uncontactedAbsences += 1;
      }
    });

    guardianContacts.forEach((contact) => {
      const group = ensureGroup(contact.group);
      const student = ensureStudent(contact.student, contact.group);
      const assistant = ensureAssistant(contact.contacted_by);
      group.guardianContacts += 1;
      student.guardianContacts += 1;
      student.lastContactStatus = contact.status;
      if (assistant) assistant.guardianContacts += 1;
    });

    academicFollowUps.forEach((entry) => {
      const group = ensureGroup(entry.group);
      const student = ensureStudent(entry.student, entry.group);
      const assistant = ensureAssistant(entry.assistant);
      group.academicFollowUps += 1;
      student.academicFollowUps += 1;
      student.lastFollowUpResult = entry.result;
      if (assistant) assistant.academicFollowUps += 1;
      if (
        entry.result === AcademicImprovementStatus.NEEDS_MORE_WORK ||
        entry.result === AcademicImprovementStatus.NOT_IMPROVED
      ) {
        totals.needsWork += 1;
        group.needsWork += 1;
        student.needsWork += 1;
      }
    });

    return {
      filters: { startDate: start.toISOString(), endDate: end.toISOString(), groupId: groupId || null, assistantId: assistantId || null },
      totals,
      groups: [...groups.values()]
        .map((group) => ({ ...group, students: undefined, studentsCount: group.students.size }))
        .sort((a, b) => b.uncontactedAbsences - a.uncontactedAbsences || b.needsWork - a.needsWork),
      students: [...students.values()]
        .sort((a, b) => b.uncontactedAbsences - a.uncontactedAbsences || b.absences - a.absences || b.needsWork - a.needsWork)
        .slice(0, 50),
      recentGuardianContacts: guardianContacts.slice(0, 30).map((contact) => ({
        id: contact.id,
        studentName: contact.student.full_name,
        groupName: contact.group.name,
        status: contact.status,
        response: contact.response,
        contactedAt: contact.contacted_at || contact.created_at,
        assistantName: contact.contacted_by?.name || null,
      })),
      recentAcademicFollowUps: academicFollowUps.slice(0, 30).map((entry) => ({
        id: entry.id,
        studentName: entry.student.full_name,
        groupName: entry.group.name,
        activityType: entry.activity_type,
        result: entry.result,
        score: entry.score == null ? null : Number(entry.score),
        maxScore: entry.max_score == null ? null : Number(entry.max_score),
        entryDate: entry.entry_date,
        assistantName: entry.assistant?.name || null,
      })),
      assistants: [...assistants.values()].sort(
        (a, b) =>
          b.attendanceRecords +
          b.guardianContacts +
          b.academicFollowUps -
          (a.attendanceRecords + a.guardianContacts + a.academicFollowUps),
      ),
    };
  }

  async createAcademicFollowUp(dto: CreateAcademicFollowUpDto, user: any) {
    let groupId = dto.groupId;
    const sessionId = dto.sessionId;
    let session: LessonRef | null = null;
    if (sessionId) {
      session = await this.prisma.teachingSession.findUnique({ where: { id: sessionId } });
      if (!session) throw new NotFoundException('Teaching session not found');
      groupId = session.group_id;
    }
    if (!groupId) {
      throw new BadRequestException('Group is required when no session is selected');
    }

    await this.ensureStudentAccess(user, dto.studentId, groupId, AssistantResponsibility.ACADEMIC_FOLLOW_UP);
    if (session?.status === TeachingSessionStatus.CANCELLED) throw new BadRequestException('Teaching session is cancelled');
    const enrollment = session
      ? (await this.lessonRoster(session, [dto.studentId])).get(dto.studentId)
      : await this.ensureStudentInGroup(dto.studentId, groupId);
    if (!enrollment) throw new BadRequestException('Student is not on the roster for this lesson');

    const entry = await this.prisma.academicFollowUpEntry.create({
      data: {
        session_id: sessionId || null,
        student_id: dto.studentId,
        group_id: groupId,
        enrollment_id: enrollment.id,
        assistant_id: user?.id,
        entry_date: new Date(dto.entryDate),
        activity_type: dto.activityType,
        score: dto.score ?? null,
        max_score: dto.maxScore ?? null,
        question_type: dto.questionType?.trim() || null,
        error_type: dto.errorType?.trim() || null,
        error_reason: dto.errorReason?.trim() || null,
        correction: dto.correction?.trim() || null,
        assistant_action: dto.assistantAction?.trim() || null,
        result: dto.result,
        notes: dto.notes?.trim() || null,
      },
      include: {
        student: true,
        group: true,
        assistant: { select: this.userSelect() },
      },
    });

    await this.audit.log({
      userId: user?.id,
      action: 'ACADEMIC_FOLLOW_UP_CREATED',
      entity: 'academic_follow_up_entry',
      entityId: entry.id,
      payload: { studentId: dto.studentId, groupId },
    });

    return entry;
  }
}
