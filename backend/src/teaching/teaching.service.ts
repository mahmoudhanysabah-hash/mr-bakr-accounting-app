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

  private async ensureAnyGroupAccess(user: any, groupId: string) {
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
      },
    });
    if (count === 0) {
      throw new ForbiddenException('Assistant is not assigned to this group');
    }
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

    const session = await this.prisma.teachingSession.create({
      data: {
        group_id: group.id,
        title: dto.title?.trim() || null,
        session_date: new Date(dto.sessionDate),
        starts_at: dto.startsAt ? new Date(dto.startsAt) : null,
        ends_at: dto.endsAt ? new Date(dto.endsAt) : null,
        created_by_id: actorId,
        attendance_assistant_id: attendanceAssistantId,
        guardian_contact_assistant_id: guardianContactAssistantId,
        academic_assistant_id: academicAssistantId,
        notes: dto.notes?.trim() || null,
      },
    });

    const enrollments = await this.prisma.studentEnrollment.findMany({
      where: {
        group_id: group.id,
        status: 'ACTIVE',
        student: { status: 'ACTIVE' },
      },
      select: { id: true, student_id: true },
    });

    if (enrollments.length > 0) {
      await this.prisma.attendanceRecord.createMany({
        data: enrollments.map((enrollment) => ({
          session_id: session.id,
          student_id: enrollment.student_id,
          group_id: group.id,
          enrollment_id: enrollment.id,
          status: AttendanceStatus.ABSENT,
        })),
        skipDuplicates: true,
      });
    }

    await this.audit.log({
      userId: actorId,
      action: 'TEACHING_SESSION_CREATED',
      entity: 'teaching_session',
      entityId: session.id,
      payload: { groupId: group.id, studentsCount: enrollments.length },
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
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      where.session_date = { gte: start, lt: end };
    }

    return this.prisma.teachingSession.findMany({
      where,
      include: {
        group: true,
        attendance_assistant: { select: this.userSelect() },
        guardian_contact_assistant: { select: this.userSelect() },
        academic_assistant: { select: this.userSelect() },
        _count: { select: { attendance_records: true, guardian_contact_logs: true, academic_follow_ups: true } },
      },
      orderBy: { session_date: 'desc' },
      take: 100,
    });
  }

  async getSession(id: string, user: any) {
    const baseSession = await this.prisma.teachingSession.findUnique({
      where: { id },
      select: { group_id: true },
    });
    if (!baseSession) {
      throw new NotFoundException('Teaching session not found');
    }
    await this.ensureAnyGroupAccess(user, baseSession.group_id);
    const allowedStudentIds = await this.assignedStudentIds(user, baseSession.group_id);
    const session = await this.prisma.teachingSession.findUnique({
      where: { id },
      include: {
        group: true,
        attendance_assistant: { select: this.userSelect() },
        guardian_contact_assistant: { select: this.userSelect() },
        academic_assistant: { select: this.userSelect() },
        attendance_records: {
          where: allowedStudentIds ? { student_id: { in: allowedStudentIds } } : undefined,
          include: {
            student: true,
            recorded_by: { select: this.userSelect() },
            contacts: {
              include: { contacted_by: { select: this.userSelect() } },
              orderBy: { created_at: 'desc' },
            },
          },
          orderBy: { student: { full_name: 'asc' } },
        },
        guardian_contact_logs: {
          where: allowedStudentIds ? { student_id: { in: allowedStudentIds } } : undefined,
          include: {
            student: true,
            contacted_by: { select: this.userSelect() },
          },
          orderBy: { created_at: 'desc' },
        },
        academic_follow_ups: {
          where: allowedStudentIds ? { student_id: { in: allowedStudentIds } } : undefined,
          include: {
            student: true,
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

    const records = [];
    for (const row of dto.records) {
      const enrollment = await this.ensureStudentInGroup(row.studentId, session.group_id);
      await this.ensureStudentAccess(user, row.studentId, session.group_id, AssistantResponsibility.ATTENDANCE);
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
            minutes_late: row.minutesLate ?? null,
            left_early_minutes: row.leftEarlyMinutes ?? null,
            notes: row.notes?.trim() || null,
          },
          update: {
            status: row.status,
            recorded_by_id: user?.id,
            recorded_at: new Date(),
            minutes_late: row.minutesLate ?? null,
            left_early_minutes: row.leftEarlyMinutes ?? null,
            notes: row.notes?.trim() || null,
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

    return this.prisma.attendanceRecord.findMany({
      where: {
        session_id: sessionId,
        student_id: allowedStudentIds ? { in: allowedStudentIds } : undefined,
      },
      include: {
        student: true,
        recorded_by: { select: this.userSelect() },
        contacts: { orderBy: { created_at: 'desc' } },
      },
      orderBy: { student: { full_name: 'asc' } },
    });
  }

  async getAbsences(sessionId: string, user: any) {
    const session = await this.prisma.teachingSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Teaching session not found');
    await this.ensureGroupAccess(user, session.group_id, AssistantResponsibility.GUARDIAN_CONTACT);
    const allowedStudentIds = await this.assignedStudentIds(user, session.group_id, AssistantResponsibility.GUARDIAN_CONTACT);

    return this.prisma.attendanceRecord.findMany({
      where: {
        session_id: sessionId,
        status: { in: [AttendanceStatus.ABSENT, AttendanceStatus.EXCUSED] },
        student_id: allowedStudentIds ? { in: allowedStudentIds } : undefined,
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

    const enrollment = await this.ensureStudentInGroup(dto.studentId, session.group_id);
    let attendanceId = dto.attendanceId;
    if (attendanceId) {
      const attendance = await this.prisma.attendanceRecord.findUnique({ where: { id: attendanceId } });
      if (!attendance || attendance.session_id !== session.id || attendance.student_id !== dto.studentId) {
        throw new BadRequestException('Attendance record does not match this session and student');
      }
    } else {
      const attendance = await this.prisma.attendanceRecord.upsert({
        where: {
          session_id_student_id: {
            session_id: session.id,
            student_id: dto.studentId,
          },
        },
        create: {
          session_id: session.id,
          student_id: dto.studentId,
          group_id: session.group_id,
          enrollment_id: enrollment.id,
          status: AttendanceStatus.ABSENT,
        },
        update: {},
      });
      attendanceId = attendance.id;
    }

    const contact = await this.prisma.guardianContactLog.create({
      data: {
        attendance_id: attendanceId,
        session_id: session.id,
        student_id: dto.studentId,
        group_id: session.group_id,
        guardian_phone: dto.guardianPhone?.trim() || enrollment.student.guardian_phone || null,
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

    const accessRows = this.isManager(user)
      ? undefined
      : await this.prisma.assistantStudentAssignment.findMany({
          where: {
            assistant_id: user?.id,
            status: AssistantAssignmentStatus.ACTIVE,
            group_id: groupFilter,
          },
          select: { group_id: true, student_id: true },
          distinct: ['group_id', 'student_id'],
        });
    if (accessRows && accessRows.length === 0) {
      return this.emptyOperationsReport(start, end, groupId, assistantId);
    }

    const studentAccessWhere = accessRows
      ? { OR: accessRows.map((row) => ({ group_id: row.group_id, student_id: row.student_id })) }
      : {};
    const assistantFilter = this.isManager(user) ? assistantId || undefined : undefined;

    const [sessions, attendanceRecords, guardianContacts, academicFollowUps] = await Promise.all([
      this.prisma.teachingSession.findMany({
        where: sessionWhere,
        include: { group: true },
        orderBy: { session_date: 'desc' },
      }),
      this.prisma.attendanceRecord.findMany({
        where: {
          session: sessionWhere,
          ...studentAccessWhere,
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
          ...studentAccessWhere,
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
          ...studentAccessWhere,
          assistant_id: assistantFilter,
        },
        include: {
          student: true,
          group: true,
          assistant: { select: this.userSelect() },
        },
        orderBy: { entry_date: 'desc' },
        take: 1000,
      }),
    ]);

    const totals = {
      sessions: sessions.length,
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
        guardianPhone: student.guardian_phone,
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

    sessions.forEach((session) => {
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
      if ((record.status === AttendanceStatus.ABSENT || record.status === AttendanceStatus.EXCUSED) && record.contacts.length === 0) {
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

  async getStudentAcademicReport(
    user: any,
    studentId: string,
    groupId: string,
    year: number,
    month: number,
  ) {
    const monthStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);

    await this.ensureStudentAccess(
      user,
      studentId,
      groupId,
      AssistantResponsibility.ACADEMIC_FOLLOW_UP,
    );

    const enrollment = await this.prisma.studentEnrollment.findFirst({
      where: {
        student_id: studentId,
        group_id: groupId,
        starts_at: { lte: monthEnd },
        OR: [{ ends_at: null }, { ends_at: { gte: monthStart } }],
      },
      include: {
        student: true,
        group: true,
      },
      orderBy: { starts_at: 'desc' },
    });

    if (!enrollment) {
      throw new NotFoundException('Student is not enrolled in this group during the selected month');
    }

    const periodStart = enrollment.starts_at > monthStart ? enrollment.starts_at : monthStart;
    const periodEnd =
      enrollment.ends_at && enrollment.ends_at < monthEnd ? enrollment.ends_at : monthEnd;

    const [sessions, unlinkedFollowUps] = await Promise.all([
      this.prisma.teachingSession.findMany({
        where: {
          group_id: groupId,
          session_date: { gte: periodStart, lte: periodEnd },
        },
        include: {
          attendance_records: {
            where: { student_id: studentId },
            include: {
              contacts: {
                orderBy: { created_at: 'desc' },
              },
            },
          },
          academic_follow_ups: {
            where: { student_id: studentId },
            orderBy: { entry_date: 'asc' },
          },
        },
        orderBy: { session_date: 'asc' },
      }),
      this.prisma.academicFollowUpEntry.findMany({
        where: {
          student_id: studentId,
          group_id: groupId,
          session_id: null,
          entry_date: { gte: periodStart, lte: periodEnd },
        },
        orderBy: { entry_date: 'asc' },
      }),
    ]);

    const academicEntries = [
      ...sessions.flatMap((session) => session.academic_follow_ups),
      ...unlinkedFollowUps,
    ];

    const attendanceCounts = {
      PRESENT: 0,
      ABSENT: 0,
      LATE: 0,
      LEFT_EARLY: 0,
      EXCUSED: 0,
      UNRECORDED: 0,
    };

    sessions.forEach((session) => {
      const attendance = session.attendance_records[0];
      if (!attendance) {
        attendanceCounts.UNRECORDED += 1;
        return;
      }
      attendanceCounts[attendance.status] += 1;
    });

    const scorePercentages = academicEntries
      .filter((entry) => entry.score != null && entry.max_score != null && Number(entry.max_score) > 0)
      .map((entry) => (Number(entry.score) / Number(entry.max_score)) * 100);

    const averageScorePercentage =
      scorePercentages.length > 0
        ? Math.round((scorePercentages.reduce((sum, value) => sum + value, 0) / scorePercentages.length) * 10) / 10
        : null;

    const resultCounts = {
      IMPROVED: 0,
      NOT_IMPROVED: 0,
      NEEDS_MORE_WORK: 0,
      NOT_ASSESSED: 0,
    };
    academicEntries.forEach((entry) => {
      resultCounts[entry.result] += 1;
    });

    const difficultyCounts = new Map<string, number>();
    academicEntries.forEach((entry) => {
      const label = entry.error_type?.trim() || entry.question_type?.trim();
      if (label) {
        difficultyCounts.set(label, (difficultyCounts.get(label) || 0) + 1);
      }
    });

    const needsSupportCount = resultCounts.NOT_IMPROVED + resultCounts.NEEDS_MORE_WORK;
    let progressLevel = 'NO_DATA';
    if (averageScorePercentage != null) {
      if (averageScorePercentage >= 85 && needsSupportCount === 0) {
        progressLevel = 'STRONG';
      } else if (averageScorePercentage >= 70) {
        progressLevel = 'GOOD';
      } else if (averageScorePercentage >= 50) {
        progressLevel = 'NEEDS_SUPPORT';
      } else {
        progressLevel = 'AT_RISK';
      }
    } else if (academicEntries.length > 0 && needsSupportCount > 0) {
      progressLevel = 'NEEDS_SUPPORT';
    }

    const formatFollowUp = (entry: any) => ({
      id: entry.id,
      entryDate: entry.entry_date,
      activityType: entry.activity_type,
      score: entry.score == null ? null : Number(entry.score),
      maxScore: entry.max_score == null ? null : Number(entry.max_score),
      questionType: entry.question_type,
      errorType: entry.error_type,
      errorReason: entry.error_reason,
      correction: entry.correction,
      assistantAction: entry.assistant_action,
      result: entry.result,
      notes: entry.notes,
    });

    return {
      filters: {
        studentId,
        groupId,
        year,
        month,
        startDate: periodStart.toISOString(),
        endDate: periodEnd.toISOString(),
      },
      student: {
        id: enrollment.student.id,
        code: enrollment.student.code,
        name: enrollment.student.full_name,
        guardianName: enrollment.student.guardian_name,
      },
      group: {
        id: enrollment.group.id,
        name: enrollment.group.name,
        code: enrollment.group.code,
      },
      summary: {
        totalSessions: sessions.length,
        sessionsWithAcademicFollowUp: sessions.filter((session) => session.academic_follow_ups.length > 0).length,
        academicFollowUps: academicEntries.length,
        attendanceRecords: sessions.length - attendanceCounts.UNRECORDED,
        attendanceRate:
          sessions.length - attendanceCounts.UNRECORDED > 0
            ? Math.round(
                ((attendanceCounts.PRESENT + attendanceCounts.LATE) /
                  (sessions.length - attendanceCounts.UNRECORDED)) *
                  100,
              )
            : null,
        averageScorePercentage,
        progressLevel,
        attendance: attendanceCounts,
        results: resultCounts,
        mainDifficulties: [...difficultyCounts.entries()]
          .map(([label, count]) => ({ label, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5),
      },
      sessions: sessions.map((session) => {
        const attendance = session.attendance_records[0] || null;
        return {
          id: session.id,
          title: session.title,
          date: session.session_date,
          status: session.status,
          attendance: attendance
            ? {
                status: attendance.status,
                minutesLate: attendance.minutes_late,
                leftEarlyMinutes: attendance.left_early_minutes,
                notes: attendance.notes,
                guardianContactStatus: attendance.contacts[0]?.status || null,
              }
            : null,
          academicFollowUps: session.academic_follow_ups.map(formatFollowUp),
        };
      }),
      unlinkedAcademicFollowUps: unlinkedFollowUps.map(formatFollowUp),
    };
  }

  async createAcademicFollowUp(dto: CreateAcademicFollowUpDto, user: any) {
    let groupId = dto.groupId;
    let sessionId = dto.sessionId;
    if (sessionId) {
      const session = await this.prisma.teachingSession.findUnique({ where: { id: sessionId } });
      if (!session) throw new NotFoundException('Teaching session not found');
      groupId = session.group_id;
    }
    if (!groupId) {
      throw new BadRequestException('Group is required when no session is selected');
    }

    await this.ensureGroupAccess(user, groupId, AssistantResponsibility.ACADEMIC_FOLLOW_UP);
    await this.ensureStudentInGroup(dto.studentId, groupId);
    await this.ensureStudentAccess(user, dto.studentId, groupId, AssistantResponsibility.ACADEMIC_FOLLOW_UP);

    const entry = await this.prisma.academicFollowUpEntry.create({
      data: {
        session_id: sessionId || null,
        student_id: dto.studentId,
        group_id: groupId,
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
