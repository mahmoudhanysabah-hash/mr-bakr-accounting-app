import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  AccountingPaymentStatus,
  AlertStatus,
  BillingPeriodStatus,
  ChargeStatus,
  EnrollmentStatus,
  ManagedStudentStatus,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateAccountingGroupDto,
  CreateAccountingPaymentDto,
  CreateChargeFromEnrollmentDto,
  CreateCompanyExpenseDto,
  CreateManagedStudentDto,
  CreateStudentDiscountDto,
  CreateStudentRefundDto,
  EndEnrollmentDto,
  EnrollStudentDto,
  GenerateAlertsDto,
  OpenBillingPeriodDto,
  TransferStudentDto,
  UpdateAccountingGroupDto,
  UpdateAlertStatusDto,
  UpdateManagedStudentDto,
  UpdateAccountingPaymentDto,
  BulkEnrollStudentsDto,
} from './dto/accounting.dto';

@Injectable()
export class AccountingService {
  private readonly storagePath = process.env.VERCEL === '1'
    ? path.join(os.tmpdir(), 'mr-bakr', 'receipts')
    : path.join(process.cwd(), 'uploads', 'receipts');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
  }

  private chargeStatusFromPaidAmount(paidAmount: Prisma.Decimal, netAmount: Prisma.Decimal) {
    if (paidAmount.greaterThanOrEqualTo(netAmount)) return ChargeStatus.PAID;
    if (paidAmount.greaterThan(0)) return ChargeStatus.PARTIALLY_PAID;
    return ChargeStatus.DUE;
  }

  private studentCode() {
    return `STU-${new Date().getFullYear()}-${randomUUID().slice(0, 6).toUpperCase()}`;
  }

  async createStudent(dto: CreateManagedStudentDto, actorId?: string) {
    const student = await this.prisma.managedStudent.create({
      data: {
        code: dto.code?.trim() || this.studentCode(),
        full_name: dto.fullName.trim(),
        student_phone: dto.studentPhone?.trim(),
        guardian_name: dto.guardianName?.trim(),
        guardian_phone: dto.guardianPhone?.trim(),
        joined_at: new Date(dto.joinedAt),
        notes: dto.notes?.trim(),
      },
    });
    await this.audit.log({
      userId: actorId,
      action: 'ACCOUNTING_STUDENT_CREATED',
      entity: 'managed_student',
      entityId: student.id,
      payload: { code: student.code, fullName: student.full_name },
    });
    return student;
  }

  async listStudents(query?: string, status?: ManagedStudentStatus, groupId?: string) {
    const q = query?.trim();
    const activeStatus = status && (status as string) !== '' ? status : undefined;
    const activeGroupId = groupId && groupId !== '' ? groupId : undefined;

    return this.prisma.managedStudent.findMany({
      where: {
        status: activeStatus,
        enrollments: activeGroupId
          ? { some: { group_id: activeGroupId, status: EnrollmentStatus.ACTIVE } }
          : undefined,
        OR: q
          ? [
              { code: { contains: q, mode: 'insensitive' } },
              { full_name: { contains: q, mode: 'insensitive' } },
              { student_phone: { contains: q } },
              { guardian_phone: { contains: q } },
            ]
          : undefined,
      },
      include: {
        enrollments: {
          where: { status: EnrollmentStatus.ACTIVE },
          include: { group: true },
          orderBy: { starts_at: 'desc' },
        },
        _count: { select: { payments: true, charges: true, enrollments: true } },
      },
      orderBy: { full_name: 'asc' },
      take: 1000,
    });
  }

  async getStudent(id: string) {
    const student = await this.prisma.managedStudent.findUnique({
      where: { id },
      include: {
        enrollments: { include: { group: true }, orderBy: { starts_at: 'desc' } },
        charges: {
          include: {
            period: true,
            group: true,
            allocations: { include: { payment: true } },
            discounts: true,
            refunds: true,
          },
          orderBy: [{ period: { year: 'desc' } }, { period: { month: 'desc' } }],
        },
        payments: {
          include: { receipts: true, allocations: { include: { charge: true } } },
          orderBy: { paid_at: 'desc' },
        },
        discounts: { include: { period: true, group: true }, orderBy: { created_at: 'desc' } },
        refunds: { include: { period: true, group: true }, orderBy: { refunded_at: 'desc' } },
        alerts: { include: { period: true }, orderBy: { created_at: 'desc' } },
      },
    });
    if (!student) throw new NotFoundException('Student not found');
    return student;
  }

  async updateStudent(id: string, dto: UpdateManagedStudentDto, actorId?: string) {
    const before = await this.prisma.managedStudent.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Student not found');
    const student = await this.prisma.managedStudent.update({
      where: { id },
      data: {
        full_name: dto.fullName?.trim(),
        student_phone: dto.studentPhone?.trim(),
        guardian_name: dto.guardianName?.trim(),
        guardian_phone: dto.guardianPhone?.trim(),
        status: dto.status,
        paused_at: dto.pausedAt ? new Date(dto.pausedAt) : undefined,
        withdrawn_at: dto.withdrawnAt ? new Date(dto.withdrawnAt) : undefined,
        exit_reason: dto.exitReason?.trim(),
        notes: dto.notes?.trim(),
      },
    });
    await this.audit.log({
      userId: actorId,
      action: 'ACCOUNTING_STUDENT_UPDATED',
      entity: 'managed_student',
      entityId: id,
      payload: { before, after: student },
    });
    return student;
  }

  async createGroup(dto: CreateAccountingGroupDto, actorId?: string) {
    const group = await this.prisma.accountingGroup.create({
      data: {
        code: dto.code.trim(),
        name: dto.name.trim(),
        type: dto.type,
        teacher_name: dto.teacherName?.trim(),
        level: dto.level?.trim(),
        default_session_price: new Prisma.Decimal(dto.defaultSessionPrice),
        default_sessions_per_month: dto.defaultSessionsPerMonth,
        default_student_target: dto.defaultStudentTarget,
        default_revenue_target:
          dto.defaultRevenueTarget === undefined
            ? undefined
            : new Prisma.Decimal(dto.defaultRevenueTarget),
        starts_at: dto.startsAt ? new Date(dto.startsAt) : undefined,
      },
    });
    await this.audit.log({
      userId: actorId,
      action: 'ACCOUNTING_GROUP_CREATED',
      entity: 'accounting_group',
      entityId: group.id,
      payload: { code: group.code, name: group.name },
    });
    return group;
  }

  listGroups(active?: boolean) {
    return this.prisma.accountingGroup.findMany({
      where: { active },
      include: {
        _count: { select: { enrollments: { where: { status: EnrollmentStatus.ACTIVE } } } },
      },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
  }

  async updateGroup(id: string, dto: UpdateAccountingGroupDto, actorId?: string) {
    const before = await this.prisma.accountingGroup.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Group not found');
    const group = await this.prisma.accountingGroup.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        type: dto.type,
        teacher_name: dto.teacherName?.trim(),
        level: dto.level?.trim(),
        default_session_price:
          dto.defaultSessionPrice === undefined
            ? undefined
            : new Prisma.Decimal(dto.defaultSessionPrice),
        default_sessions_per_month: dto.defaultSessionsPerMonth,
        default_student_target: dto.defaultStudentTarget,
        default_revenue_target:
          dto.defaultRevenueTarget === undefined
            ? undefined
            : new Prisma.Decimal(dto.defaultRevenueTarget),
        active: dto.active,
      },
    });
    await this.audit.log({
      userId: actorId,
      action: 'ACCOUNTING_GROUP_UPDATED',
      entity: 'accounting_group',
      entityId: id,
      payload: { before, after: group },
    });
    return group;
  }

  async deleteGroup(id: string, actorId?: string) {
    const group = await this.prisma.accountingGroup.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            enrollments: true,
            monthly_plans: true,
            charges: true,
            discounts: true,
            refunds: true,
          },
        },
      },
    });
    if (!group) throw new NotFoundException('Group not found');

    const hasHistory =
      group._count.enrollments > 0 ||
      group._count.monthly_plans > 0 ||
      group._count.charges > 0 ||
      group._count.discounts > 0 ||
      group._count.refunds > 0;

    if (hasHistory) {
      const archived = await this.prisma.accountingGroup.update({
        where: { id },
        data: { active: false, ends_at: new Date() },
      });
      await this.audit.log({
        userId: actorId,
        action: 'ACCOUNTING_GROUP_ARCHIVED',
        entity: 'accounting_group',
        entityId: id,
        payload: { before: group, after: archived, reason: 'group_has_accounting_history' },
      });
      return { deleted: false, archived: true, group: archived };
    }

    await this.prisma.accountingGroup.delete({ where: { id } });
    await this.audit.log({
      userId: actorId,
      action: 'ACCOUNTING_GROUP_DELETED',
      entity: 'accounting_group',
      entityId: id,
      payload: { group },
    });
    return { deleted: true, archived: false };
  }

  async enrollStudent(dto: EnrollStudentDto, actorId?: string) {
    const [student, group, duplicate] = await Promise.all([
      this.prisma.managedStudent.findUnique({ where: { id: dto.studentId } }),
      this.prisma.accountingGroup.findUnique({ where: { id: dto.groupId } }),
      this.prisma.studentEnrollment.findFirst({
        where: {
          student_id: dto.studentId,
          group_id: dto.groupId,
          status: EnrollmentStatus.ACTIVE,
        },
      }),
    ]);
    if (!student) throw new NotFoundException('Student not found');
    if (!group || !group.active) throw new NotFoundException('Active group not found');
    if (duplicate) throw new ConflictException('Student is already active in this group');

    const enrollment = await this.prisma.studentEnrollment.create({
      data: {
        student_id: dto.studentId,
        group_id: dto.groupId,
        starts_at: new Date(dto.startsAt),
        custom_session_price:
          dto.customSessionPrice === undefined
            ? undefined
            : new Prisma.Decimal(dto.customSessionPrice),
        custom_sessions_per_month: dto.customSessionsPerMonth,
        notes: dto.notes?.trim(),
      },
      include: { student: true, group: true },
    });
    await this.audit.log({
      userId: actorId,
      action: 'STUDENT_ENROLLED',
      entity: 'student_enrollment',
      entityId: enrollment.id,
      payload: { studentId: dto.studentId, groupId: dto.groupId },
    });
    return enrollment;
  }

  async enrollStudentsBulk(dto: BulkEnrollStudentsDto, actorId?: string) {
    const group = await this.prisma.accountingGroup.findUnique({ where: { id: dto.groupId } });
    if (!group || !group.active) throw new NotFoundException('Active group not found');

    // Get all valid students
    const validStudents = await this.prisma.managedStudent.findMany({
      where: { id: { in: dto.studentIds } },
      select: { id: true },
    });
    const validStudentIds = validStudents.map(s => s.id);

    // Get existing active enrollments for these students in this group
    const existingEnrollments = await this.prisma.studentEnrollment.findMany({
      where: {
        student_id: { in: validStudentIds },
        group_id: dto.groupId,
        status: EnrollmentStatus.ACTIVE,
      },
      select: { student_id: true },
    });
    const existingStudentIds = new Set(existingEnrollments.map(e => e.student_id));

    // Filter to only new enrollments
    const newStudentIds = validStudentIds.filter(id => !existingStudentIds.has(id));

    if (newStudentIds.length === 0) {
      return { success: true, count: 0 };
    }

    // Bulk create
    const payloadData = newStudentIds.map(studentId => ({
      student_id: studentId,
      group_id: dto.groupId,
      starts_at: new Date(dto.startsAt),
    }));

    const result = await this.prisma.studentEnrollment.createMany({
      data: payloadData,
      skipDuplicates: true,
    });

    await this.audit.log({
      userId: actorId,
      action: 'STUDENTS_BULK_ENROLLED',
      entity: 'accounting_group',
      entityId: dto.groupId,
      payload: { count: result.count, studentIds: newStudentIds },
    });

    return { success: true, count: result.count };
  }

  async transferStudent(dto: TransferStudentDto, actorId?: string) {
    const enrollment = await this.prisma.studentEnrollment.findUnique({
      where: { id: dto.enrollmentId },
    });
    if (!enrollment || enrollment.status !== EnrollmentStatus.ACTIVE) {
      throw new NotFoundException('Active enrollment not found');
    }
    if (enrollment.group_id === dto.toGroupId) {
      throw new BadRequestException('Student is already in the selected group');
    }
    const destination = await this.prisma.accountingGroup.findUnique({ where: { id: dto.toGroupId } });
    if (!destination || !destination.active) throw new NotFoundException('Destination group not found');

    const effectiveAt = new Date(dto.effectiveAt);
    if (effectiveAt < enrollment.starts_at) {
      throw new BadRequestException('Transfer date cannot precede enrollment start');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.studentEnrollment.update({
        where: { id: enrollment.id },
        data: { status: EnrollmentStatus.ENDED, ends_at: effectiveAt, exit_reason: dto.reason.trim() },
      });
      return tx.studentEnrollment.create({
        data: {
          student_id: enrollment.student_id,
          group_id: dto.toGroupId,
          starts_at: effectiveAt,
          custom_session_price:
            dto.customSessionPrice === undefined
              ? undefined
              : new Prisma.Decimal(dto.customSessionPrice),
          custom_sessions_per_month: dto.customSessionsPerMonth,
          notes: `Transferred from enrollment ${enrollment.id}`,
        },
        include: { student: true, group: true },
      });
    });
    await this.audit.log({
      userId: actorId,
      action: 'STUDENT_TRANSFERRED',
      entity: 'student_enrollment',
      entityId: result.id,
      payload: { fromEnrollmentId: enrollment.id, toGroupId: dto.toGroupId, effectiveAt, reason: dto.reason },
    });
    return result;
  }

  async endEnrollment(id: string, dto: EndEnrollmentDto, actorId?: string) {
    const enrollment = await this.prisma.studentEnrollment.findUnique({ where: { id } });
    if (!enrollment || enrollment.status !== EnrollmentStatus.ACTIVE) {
      throw new NotFoundException('Active enrollment not found');
    }
    const effectiveAt = new Date(dto.effectiveAt);
    const result = await this.prisma.$transaction(async (tx) => {
      const ended = await tx.studentEnrollment.update({
        where: { id },
        data: { status: EnrollmentStatus.ENDED, ends_at: effectiveAt, exit_reason: dto.reason.trim() },
      });
      if (dto.studentStatus) {
        await tx.managedStudent.update({
          where: { id: enrollment.student_id },
          data: {
            status: dto.studentStatus,
            withdrawn_at:
              dto.studentStatus === ManagedStudentStatus.WITHDRAWN ? effectiveAt : undefined,
            paused_at: dto.studentStatus === ManagedStudentStatus.PAUSED ? effectiveAt : undefined,
            exit_reason: dto.reason.trim(),
          },
        });
      }
      return ended;
    });
    await this.audit.log({
      userId: actorId,
      action: 'STUDENT_ENROLLMENT_ENDED',
      entity: 'student_enrollment',
      entityId: id,
      payload: { effectiveAt, reason: dto.reason, studentStatus: dto.studentStatus },
    });
    return result;
  }

  async openBillingPeriod(dto: OpenBillingPeriodDto, actorId?: string) {
    const existing = await this.prisma.billingPeriod.findUnique({
      where: { year_month: { year: dto.year, month: dto.month } },
    });
    if (existing) throw new ConflictException('Billing period already exists');

    const periodStart = new Date(Date.UTC(dto.year, dto.month - 1, 1));
    const nextPeriodStart = new Date(Date.UTC(dto.year, dto.month, 1));
    const dueDate = dto.dueDate ? new Date(dto.dueDate) : new Date(Date.UTC(dto.year, dto.month - 1, 10));

    const result = await this.prisma.$transaction(async (tx) => {
      const groups = await tx.accountingGroup.findMany({ where: { active: true } });
      const enrollments = await tx.studentEnrollment.findMany({
        where: {
          starts_at: { lt: nextPeriodStart },
          OR: [{ ends_at: null }, { ends_at: { gte: periodStart } }],
          student: { status: ManagedStudentStatus.ACTIVE },
          group: { active: true },
        },
      });

      const period = await tx.billingPeriod.create({
        data: {
          year: dto.year,
          month: dto.month,
          status: BillingPeriodStatus.OPEN,
          opened_at: new Date(),
          opened_by_id: actorId,
        },
      });

      const plansByGroup = new Map<string, { id: string; sessions: number; price: Prisma.Decimal }>();
      for (const group of groups) {
        const override = dto.groupOverrides?.find(o => o.groupId === group.id);
        const sessionsCount = override ? override.sessionsCount : group.default_sessions_per_month;

        const plan = await tx.monthlyGroupPlan.create({
          data: {
            period_id: period.id,
            group_id: group.id,
            sessions_count: sessionsCount,
            session_price: group.default_session_price,
            student_target: group.default_student_target,
            revenue_target: group.default_revenue_target,
          },
        });
        plansByGroup.set(group.id, {
          id: plan.id,
          sessions: plan.sessions_count,
          price: plan.session_price,
        });
      }

      const chargesData = [];
      for (const enrollment of enrollments) {
        const plan = plansByGroup.get(enrollment.group_id);
        if (!plan) continue;
        const sessions = enrollment.custom_sessions_per_month ?? plan.sessions;
        const price = enrollment.custom_session_price ?? plan.price;
        const gross = price.mul(sessions);
        chargesData.push({
          period_id: period.id,
          monthly_plan_id: plan.id,
          student_id: enrollment.student_id,
          enrollment_id: enrollment.id,
          group_id: enrollment.group_id,
          sessions_count: sessions,
          session_price: price,
          gross_amount: gross,
          net_amount: gross,
          due_date: dueDate,
          status: ChargeStatus.DUE,
        });
      }
      
      let chargesCreated = 0;
      if (chargesData.length > 0) {
        const createResult = await tx.monthlyCharge.createMany({
          data: chargesData,
        });
        chargesCreated = createResult.count;
      }
      return { period, plansCreated: plansByGroup.size, chargesCreated };
    }, {
      maxWait: 5000,
      timeout: 30000,
    });

    await this.audit.log({
      userId: actorId,
      action: 'BILLING_PERIOD_OPENED',
      entity: 'billing_period',
      entityId: result.period.id,
      payload: { year: dto.year, month: dto.month, plansCreated: result.plansCreated, chargesCreated: result.chargesCreated },
    });
    return result;
  }

  async listBillingPeriods() {
    return this.prisma.billingPeriod.findMany({
      include: {
        _count: { select: { group_plans: true, charges: true } },
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });
  }

  async getBillingPeriod(id: string) {
    const period = await this.prisma.billingPeriod.findUnique({
      where: { id },
      include: {
        group_plans: { include: { group: true } },
        charges: {
          include: {
            student: true,
            group: true,
            allocations: { where: { payment: { status: AccountingPaymentStatus.APPROVED } } },
          },
        },
      },
    });
    if (!period) throw new NotFoundException('Billing period not found');

    const charges = period.charges.map((charge) => {
      const paid = charge.allocations.reduce(
        (sum, allocation) => sum.plus(allocation.amount),
        new Prisma.Decimal(0),
      );
      return { ...charge, paid_amount: paid, balance: charge.net_amount.minus(paid) };
    });
    const totals = charges.reduce(
      (acc, charge) => ({
        due: acc.due.plus(charge.net_amount),
        paid: acc.paid.plus(charge.paid_amount),
        balance: acc.balance.plus(charge.balance),
      }),
      { due: new Prisma.Decimal(0), paid: new Prisma.Decimal(0), balance: new Prisma.Decimal(0) },
    );
    return { ...period, charges, totals };
  }

  async closeBillingPeriod(id: string, actorId?: string) {
    const period = await this.prisma.billingPeriod.findUnique({ where: { id } });
    if (!period) throw new NotFoundException('Billing period not found');
    if (period.status !== BillingPeriodStatus.OPEN) {
      throw new BadRequestException('Only an open billing period can be closed');
    }
    const closed = await this.prisma.billingPeriod.update({
      where: { id },
      data: { status: BillingPeriodStatus.CLOSED, closed_at: new Date(), closed_by_id: actorId },
    });
    await this.audit.log({
      userId: actorId,
      action: 'BILLING_PERIOD_CLOSED',
      entity: 'billing_period',
      entityId: id,
      payload: { year: period.year, month: period.month },
    });
    return closed;
  }

  async createChargeFromEnrollment(dto: CreateChargeFromEnrollmentDto, actorId?: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const period = await tx.billingPeriod.findUnique({ where: { id: dto.periodId } });
      if (!period) throw new NotFoundException('Billing period not found');
      if (period.status !== BillingPeriodStatus.OPEN) {
        throw new BadRequestException('Charges can only be added to an open billing period');
      }

      const enrollment = await tx.studentEnrollment.findUnique({
        where: { id: dto.enrollmentId },
        include: { student: true, group: true },
      });
      if (!enrollment || enrollment.status !== EnrollmentStatus.ACTIVE) {
        throw new NotFoundException('Active enrollment not found');
      }
      if (enrollment.student.status !== ManagedStudentStatus.ACTIVE) {
        throw new BadRequestException('Paused or withdrawn students cannot receive new monthly charges');
      }
      if (!enrollment.group.active) {
        throw new BadRequestException('Inactive groups cannot receive new monthly charges');
      }

      const periodStart = new Date(Date.UTC(period.year, period.month - 1, 1));
      const nextPeriodStart = new Date(Date.UTC(period.year, period.month, 1));
      if (
        enrollment.starts_at >= nextPeriodStart ||
        (enrollment.ends_at && enrollment.ends_at < periodStart)
      ) {
        throw new BadRequestException('Enrollment is not active during this billing period');
      }

      const duplicate = await tx.monthlyCharge.findUnique({
        where: { period_id_enrollment_id: { period_id: period.id, enrollment_id: enrollment.id } },
      });
      if (duplicate) {
        throw new ConflictException('This enrollment already has a charge in the selected period');
      }

      let plan = await tx.monthlyGroupPlan.findUnique({
        where: { period_id_group_id: { period_id: period.id, group_id: enrollment.group_id } },
      });
      if (!plan) {
        plan = await tx.monthlyGroupPlan.create({
          data: {
            period_id: period.id,
            group_id: enrollment.group_id,
            sessions_count: enrollment.group.default_sessions_per_month,
            session_price: enrollment.group.default_session_price,
            student_target: enrollment.group.default_student_target,
            revenue_target: enrollment.group.default_revenue_target,
          },
        });
      }

      const sessions = dto.sessionsCount ?? enrollment.custom_sessions_per_month ?? plan.sessions_count;
      const price = dto.sessionPrice === undefined
        ? (enrollment.custom_session_price ?? plan.session_price)
        : new Prisma.Decimal(dto.sessionPrice);
      const gross = price.mul(sessions);
      const dueDate = dto.dueDate
        ? new Date(dto.dueDate)
        : new Date(Date.UTC(period.year, period.month - 1, 10));

      const charge = await tx.monthlyCharge.create({
        data: {
          period_id: period.id,
          monthly_plan_id: plan.id,
          student_id: enrollment.student_id,
          enrollment_id: enrollment.id,
          group_id: enrollment.group_id,
          sessions_count: sessions,
          session_price: price,
          gross_amount: gross,
          net_amount: gross,
          due_date: dueDate,
          status: ChargeStatus.DUE,
          notes: dto.notes?.trim() || 'Manual charge for an enrollment added after opening the period',
        },
        include: { period: true, student: true, group: true, allocations: true },
      });

      return charge;
    }, { maxWait: 5000, timeout: 30000 });

    await this.audit.log({
      userId: actorId,
      action: 'MONTHLY_CHARGE_CREATED_FROM_ENROLLMENT',
      entity: 'monthly_charge',
      entityId: result.id,
      payload: {
        periodId: result.period_id,
        enrollmentId: result.enrollment_id,
        studentId: result.student_id,
        groupId: result.group_id,
        netAmount: result.net_amount,
      },
    });

    return result;
  }

  async recordPayment(dto: CreateAccountingPaymentDto, actorId?: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      let allocationsToApply: { chargeId: string; amount: number }[] = dto.allocations || [];

      if (allocationsToApply.length === 0) {
        const unpaidCharges = await tx.monthlyCharge.findMany({
          where: {
            student_id: dto.studentId,
            status: { in: [ChargeStatus.DUE, ChargeStatus.PARTIALLY_PAID] },
          },
          include: {
            allocations: { where: { payment: { status: AccountingPaymentStatus.APPROVED } } },
            period: true,
          },
          orderBy: [
            { period: { year: 'asc' } },
            { period: { month: 'asc' } },
          ],
        });

        let remainingAmount = dto.amount;
        for (const charge of unpaidCharges) {
          if (remainingAmount <= 0.001) break;
          const alreadyPaid = charge.allocations.reduce(
            (sum, item) => sum.plus(item.amount),
            new Prisma.Decimal(0),
          );
          const outstanding = Number(charge.net_amount.minus(alreadyPaid));
          if (outstanding > 0) {
            const applyAmount = Math.min(remainingAmount, outstanding);
            allocationsToApply.push({
              chargeId: charge.id,
              amount: applyAmount,
            });
            remainingAmount -= applyAmount;
          }
        }
      }

      const allocationTotal = allocationsToApply.reduce((sum, allocation) => sum + allocation.amount, 0);
      if (allocationTotal - dto.amount > 0.001) {
        throw new BadRequestException('Allocated amount cannot exceed payment amount');
      }
      
      const chargeIds = [...new Set(allocationsToApply.map((allocation) => allocation.chargeId))];
      if (chargeIds.length !== allocationsToApply.length) {
        throw new BadRequestException('A charge can only appear once in payment allocations');
      }

      const student = await tx.managedStudent.findUnique({ where: { id: dto.studentId } });
      const charges = await tx.monthlyCharge.findMany({
        where: { id: { in: chargeIds } },
        include: {
          allocations: { where: { payment: { status: AccountingPaymentStatus.APPROVED } } },
        },
      });

      if (!student) throw new NotFoundException('Student not found');
      if (charges.length !== chargeIds.length) throw new NotFoundException('One or more charges were not found');

      const chargeMap = new Map(charges.map((charge) => [charge.id, charge]));
      for (const allocation of allocationsToApply) {
        const charge = chargeMap.get(allocation.chargeId);
        if (!charge || charge.student_id !== dto.studentId) {
          throw new BadRequestException('Every charge must belong to the selected student');
        }
        const alreadyPaid = charge.allocations.reduce(
          (sum, item) => sum.plus(item.amount),
          new Prisma.Decimal(0),
        );
        const outstanding = charge.net_amount.minus(alreadyPaid);
        if (new Prisma.Decimal(allocation.amount).greaterThan(outstanding)) {
          throw new BadRequestException(`Allocation exceeds outstanding balance for charge ${charge.id}`);
        }
      }

      const unallocatedCredit = new Prisma.Decimal(dto.amount).minus(allocationTotal);

      const payment = await tx.accountingPayment.create({
        data: {
          student_id: dto.studentId,
          amount: new Prisma.Decimal(dto.amount),
          method: dto.method,
          status: AccountingPaymentStatus.APPROVED,
          paid_at: new Date(dto.paidAt),
          external_reference: dto.externalReference?.trim(),
          notes: dto.notes?.trim(),
          recorded_by_id: actorId,
          reviewed_by_id: actorId,
          reviewed_at: new Date(),
        },
      });

      for (const allocation of allocationsToApply) {
        await tx.paymentAllocation.create({
          data: {
            payment_id: payment.id,
            charge_id: allocation.chargeId,
            amount: new Prisma.Decimal(allocation.amount),
          },
        });
        const charge = chargeMap.get(allocation.chargeId)!;
        const previousPaid = charge.allocations.reduce(
          (sum, item) => sum.plus(item.amount),
          new Prisma.Decimal(0),
        );
        const newPaid = previousPaid.plus(allocation.amount);
        await tx.monthlyCharge.update({
          where: { id: charge.id },
          data: {
            status: newPaid.greaterThanOrEqualTo(charge.net_amount)
              ? ChargeStatus.PAID
              : ChargeStatus.PARTIALLY_PAID,
          },
        });
      }

      if (unallocatedCredit.greaterThan(0)) {
        await tx.managedStudent.update({
          where: { id: dto.studentId },
          data: { credit_balance: { increment: unallocatedCredit } },
        });
      }
      return { payment, allocationsToApply, unallocatedCredit };
    }, { maxWait: 5000, timeout: 30000 });

    await this.audit.log({
      userId: actorId,
      action: 'ACCOUNTING_PAYMENT_RECORDED',
      entity: 'accounting_payment',
      entityId: result.payment.id,
      payload: { amount: dto.amount, allocations: result.allocationsToApply, unallocatedCredit: result.unallocatedCredit },
    });
    return { payment: result.payment, unallocatedCredit: result.unallocatedCredit };
  }

  async getPayment(id: string) {
    const payment = await this.prisma.accountingPayment.findUnique({
      where: { id },
      include: {
        student: true,
        allocations: { include: { charge: { include: { period: true, group: true } } } },
      },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    return payment;
  }

  async deletePayment(id: string, actorId?: string, reason = 'Payment reversed by user action') {
    const payment = await this.prisma.accountingPayment.findUnique({
      where: { id },
      include: { allocations: true, receipts: true },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status === AccountingPaymentStatus.REVERSED) {
      throw new BadRequestException('Payment is already reversed');
    }

    await this.prisma.$transaction(async (tx) => {
      // 1. Revert allocations
      for (const allocation of payment.allocations) {
        const charge = await tx.monthlyCharge.findUnique({
          where: { id: allocation.charge_id },
          include: { allocations: { include: { payment: true } } },
        });
        if (charge) {
          // Filter allocations to only count approved payments, excluding this reversed one
          const otherAllocations = charge.allocations.filter(
            a => a.id !== allocation.id && a.payment.status === AccountingPaymentStatus.APPROVED,
          );
          const newPaid = otherAllocations.reduce((sum, a) => sum.plus(a.amount), new Prisma.Decimal(0));
          await tx.monthlyCharge.update({
            where: { id: charge.id },
            data: {
              status: this.chargeStatusFromPaidAmount(newPaid, charge.net_amount),
            },
          });
        }
      }

      // 2. Revert unallocated credit
      const allocationTotal = payment.allocations.reduce((sum, a) => sum.plus(a.amount), new Prisma.Decimal(0));
      const unallocatedCredit = payment.amount.minus(allocationTotal);
      if (unallocatedCredit.greaterThan(0)) {
        await tx.managedStudent.update({
          where: { id: payment.student_id },
          data: { credit_balance: { decrement: unallocatedCredit } },
        });
      }

      // 3. Mark payment as REVERSED. Allocations, receipts, and receipt files remain immutable.
      await tx.accountingPayment.update({
        where: { id },
        data: {
          status: AccountingPaymentStatus.REVERSED,
          reversed_at: new Date(),
          reversal_reason: reason,
        },
      });
    });

    await this.audit.log({
      userId: actorId,
      action: 'ACCOUNTING_PAYMENT_REVERSED',
      entity: 'accounting_payment',
      entityId: id,
      payload: {
        amount: payment.amount,
        allocationCount: payment.allocations.length,
        receiptCount: payment.receipts.length,
        reason,
      },
    });

    return { success: true };
  }

  async updatePayment(id: string, dto: UpdateAccountingPaymentDto, actorId?: string) {
    const payment = await this.prisma.accountingPayment.findUnique({
      where: { id },
    });
    if (!payment) throw new NotFoundException('Payment not found');

    if (dto.amount !== undefined && Number(dto.amount) !== Number(payment.amount)) {
      await this.deletePayment(id, actorId, 'Payment amount changed; original payment reversed before replacement');
      
      const newPaymentDto: CreateAccountingPaymentDto = {
        studentId: payment.student_id,
        amount: dto.amount,
        method: dto.method || payment.method,
        paidAt: dto.paidAt || payment.paid_at.toISOString(),
        externalReference: dto.externalReference !== undefined ? dto.externalReference : payment.external_reference || undefined,
        notes: dto.notes !== undefined ? dto.notes : payment.notes || undefined,
      };
      
      const { payment: newPayment } = await this.recordPayment(newPaymentDto, actorId);
      return newPayment;
    } else {
      const updated = await this.prisma.accountingPayment.update({
        where: { id },
        data: {
          method: dto.method,
          paid_at: dto.paidAt ? new Date(dto.paidAt) : undefined,
          external_reference: dto.externalReference,
          notes: dto.notes,
        },
      });

      await this.audit.log({
        userId: actorId,
        action: 'ACCOUNTING_PAYMENT_UPDATED',
        entity: 'accounting_payment',
        entityId: id,
        payload: { dto },
      });

      return updated;
    }
  }

  async deleteReceipt(storageKey: string, actorId?: string) {
    const receipt = await this.prisma.paymentReceipt.findUnique({ where: { storage_key: storageKey } });
    if (!receipt) throw new NotFoundException('Receipt not found');

    await this.audit.log({
      userId: actorId,
      action: 'ACCOUNTING_RECEIPT_DELETE_BLOCKED',
      entity: 'payment_receipt',
      entityId: receipt.id,
      payload: { storageKey },
    });

    throw new BadRequestException('Receipts are immutable. Reverse the related payment instead of deleting its receipt.');
  }

  async uploadReceipt(paymentId: string, file: Express.Multer.File, actorId?: string) {
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    const maxSizeBytes = 5 * 1024 * 1024; // 5 MB

    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException('Invalid file type. Only JPEG, PNG, and PDF are allowed.');
    }
    if (file.size > maxSizeBytes) {
      throw new BadRequestException('File is too large. Maximum size is 5MB.');
    }

    const payment = await this.prisma.accountingPayment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Payment not found');

    const storageKey = `${paymentId}-${randomUUID()}${path.extname(file.originalname)}`;
    const filePath = path.join(this.storagePath, storageKey);

    await fs.promises.writeFile(filePath, file.buffer);

    try {
      const receipt = await this.prisma.paymentReceipt.create({
        data: {
          payment_id: paymentId,
          original_name: file.originalname,
          storage_key: storageKey,
          mime_type: file.mimetype,
          size_bytes: file.size,
          uploaded_by_id: actorId,
        },
      });

      await this.audit.log({
        userId: actorId,
        action: 'ACCOUNTING_RECEIPT_UPLOADED',
        entity: 'payment_receipt',
        entityId: receipt.id,
        payload: { paymentId, originalName: file.originalname },
      });

      return receipt;
    } catch (e) {
      await fs.promises.unlink(filePath).catch(() => {});
      throw e;
    }
  }

  async grantDiscount(dto: CreateStudentDiscountDto, actorId?: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      let chargeId = dto.chargeId;

      if (!chargeId) {
        if (!dto.studentId || !dto.groupId || !dto.periodId) {
          throw new BadRequestException('Either chargeId or (studentId, groupId, and periodId) must be provided');
        }
        const resolvedCharge = await tx.monthlyCharge.findFirst({
          where: {
            student_id: dto.studentId,
            group_id: dto.groupId,
            period_id: dto.periodId,
          },
        });
        if (!resolvedCharge) {
          throw new NotFoundException('No monthly charge found for the specified group and period');
        }
        chargeId = resolvedCharge.id;
      }

      const charge = await tx.monthlyCharge.findUnique({
        where: { id: chargeId },
        include: { 
          allocations: { where: { payment: { status: AccountingPaymentStatus.APPROVED } } },
          period: true
        },
      });
      if (!charge) throw new NotFoundException('Charge not found');
      if (charge.period.status === 'CLOSED') {
        throw new BadRequestException('Cannot apply discount to a charge in a closed financial period');
      }

      const discountAmount = new Prisma.Decimal(dto.amount);
      if (discountAmount.greaterThan(charge.net_amount)) {
        throw new BadRequestException('Discount cannot exceed the net amount of the charge');
      }

      const paidAmount = charge.allocations.reduce(
        (sum, item) => sum.plus(item.amount),
        new Prisma.Decimal(0),
      );
      
      const newNetAmount = charge.net_amount.minus(discountAmount);
      
      if (paidAmount.greaterThan(newNetAmount)) {
         throw new BadRequestException('Discount cannot be applied because paid amount exceeds the new net amount');
      }

      const newStatus = paidAmount.greaterThanOrEqualTo(newNetAmount)
        ? ChargeStatus.PAID
        : paidAmount.greaterThan(0)
        ? ChargeStatus.PARTIALLY_PAID
        : ChargeStatus.DUE;

      const discount = await tx.studentDiscount.create({
        data: {
          student_id: charge.student_id,
          group_id: charge.group_id,
          period_id: charge.period_id,
          charge_id: charge.id,
          amount: discountAmount,
          reason: dto.reason.trim(),
          created_by_id: actorId,
          approved_by_id: actorId,
        },
      });

      await tx.monthlyCharge.update({
        where: { id: charge.id },
        data: {
          discount_amount: charge.discount_amount.plus(discountAmount),
          net_amount: newNetAmount,
          status: newStatus,
        },
      });
      return discount;
    }, { maxWait: 5000, timeout: 30000 });

    await this.audit.log({
      userId: actorId,
      action: 'ACCOUNTING_DISCOUNT_GRANTED',
      entity: 'student_discount',
      entityId: result.id,
      payload: { chargeId: dto.chargeId, amount: dto.amount, reason: dto.reason },
    });

    return result;
  }

  async recordRefund(dto: CreateStudentRefundDto, actorId?: string) {
    const student = await this.prisma.managedStudent.findUnique({ where: { id: dto.studentId } });
    if (!student) throw new NotFoundException('Student not found');

    const refund = await this.prisma.studentRefund.create({
      data: {
        student_id: dto.studentId,
        amount: new Prisma.Decimal(dto.amount),
        reason: dto.reason.trim(),
        method: dto.method,
        refunded_at: new Date(dto.refundedAt),
        external_reference: dto.externalReference?.trim(),
        group_id: dto.groupId,
        period_id: dto.periodId,
        charge_id: dto.chargeId,
        sessions_count: dto.sessionsCount,
        created_by_id: actorId,
        approved_by_id: actorId,
      },
    });

    await this.audit.log({
      userId: actorId,
      action: 'ACCOUNTING_REFUND_RECORDED',
      entity: 'student_refund',
      entityId: refund.id,
      payload: { studentId: dto.studentId, amount: dto.amount, reason: dto.reason },
    });

    return refund;
  }

  async getReceiptFile(storageKey: string) {
    const receipt = await this.prisma.paymentReceipt.findUnique({ where: { storage_key: storageKey } });
    if (!receipt) throw new NotFoundException('Receipt not found');

    const filePath = path.join(this.storagePath, storageKey);
    if (!fs.existsSync(filePath)) throw new NotFoundException('File not found on disk');

    return { buffer: fs.readFileSync(filePath), mimeType: receipt.mime_type, originalName: receipt.original_name };
  }

  // --- Expenses ---
  async recordExpense(dto: CreateCompanyExpenseDto, actorId?: string) {
    const expense = await this.prisma.companyExpense.create({
      data: {
        category: dto.category.trim(),
        amount: new Prisma.Decimal(dto.amount),
        method: dto.method,
        spent_at: new Date(dto.spentAt),
        description: dto.description.trim(),
        external_reference: dto.externalReference?.trim(),
        recorded_by_id: actorId,
      },
    });

    await this.audit.log({
      userId: actorId,
      action: 'ACCOUNTING_EXPENSE_RECORDED',
      entity: 'company_expense',
      entityId: expense.id,
      payload: { amount: dto.amount, category: dto.category },
    });

    return expense;
  }

  async listExpenses(month?: number, year?: number) {
    const where: any = {};
    if (month && year) {
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 0, 23, 59, 59, 999);
      where.spent_at = { gte: start, lte: end };
    }

    return this.prisma.companyExpense.findMany({
      where,
      orderBy: { spent_at: 'desc' },
    });
  }

  async uploadExpenseReceipt(expenseId: string, file: Express.Multer.File, actorId?: string) {
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    const maxSizeBytes = 5 * 1024 * 1024; // 5 MB

    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException('Invalid file type. Only JPEG, PNG, and PDF are allowed.');
    }
    if (file.size > maxSizeBytes) {
      throw new BadRequestException('File is too large. Maximum size is 5MB.');
    }

    const expense = await this.prisma.companyExpense.findUnique({ where: { id: expenseId } });
    if (!expense) throw new NotFoundException('Expense not found');

    const storageKey = `EXP-${expenseId}-${randomUUID()}${path.extname(file.originalname)}`;
    const filePath = path.join(this.storagePath, storageKey);

    await fs.promises.writeFile(filePath, file.buffer);

    try {
      const updatedExpense = await this.prisma.companyExpense.update({
        where: { id: expenseId },
        data: { receipt_storage_key: storageKey },
      });

      await this.audit.log({
        userId: actorId,
        action: 'ACCOUNTING_EXPENSE_RECEIPT_UPLOADED',
        entity: 'company_expense',
        entityId: expenseId,
        payload: { originalName: file.originalname },
      });

      return updatedExpense;
    } catch (e) {
      await fs.promises.unlink(filePath).catch(() => {});
      throw e;
    }
  }

  async getExpenseReceiptFile(storageKey: string) {
    const expense = await this.prisma.companyExpense.findFirst({ where: { receipt_storage_key: storageKey } });
    if (!expense) throw new NotFoundException('Receipt not found');

    const filePath = path.join(this.storagePath, storageKey);
    if (!fs.existsSync(filePath)) throw new NotFoundException('File not found on disk');

    return { buffer: fs.readFileSync(filePath), mimeType: 'application/octet-stream', originalName: `receipt-${storageKey}` };
  }

  // --- Collection Alerts ---
  async generateCollectionAlerts(dto: GenerateAlertsDto, actorId?: string) {
    const period = await this.prisma.billingPeriod.findUnique({ where: { id: dto.periodId } });
    if (!period) throw new NotFoundException('Period not found');

    const unpaidCharges = await this.prisma.monthlyCharge.findMany({
      where: {
        period_id: dto.periodId,
        status: { in: [ChargeStatus.DUE, ChargeStatus.PARTIALLY_PAID] },
      },
    });

    let newAlertsCount = 0;
    for (const charge of unpaidCharges) {
      const existing = await this.prisma.collectionAlert.findUnique({
        where: { student_id_period_id: { student_id: charge.student_id, period_id: dto.periodId } },
      });

      if (!existing) {
        await this.prisma.collectionAlert.create({
          data: { student_id: charge.student_id, period_id: dto.periodId },
        });
        newAlertsCount++;
      } else if (existing.status === AlertStatus.RESOLVED) {
        // If it was resolved but they are still unpaid, reopen it
        await this.prisma.collectionAlert.update({
          where: { id: existing.id },
          data: { status: AlertStatus.OPEN },
        });
        newAlertsCount++;
      }
    }

    await this.audit.log({
      userId: actorId,
      action: 'ACCOUNTING_ALERTS_GENERATED',
      payload: { periodId: dto.periodId, count: newAlertsCount },
    });

    return { success: true, count: newAlertsCount };
  }

  async listAlerts(periodId?: string) {
    const where: any = {};
    if (periodId) where.period_id = periodId;

    return this.prisma.collectionAlert.findMany({
      where,
      include: {
        student: {
          include: {
            charges: {
              where: { status: { in: ['DUE', 'PARTIALLY_PAID'] } },
              include: { allocations: true }
            }
          }
        },
        period: true,
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async updateAlertStatus(id: string, dto: UpdateAlertStatusDto, actorId?: string) {
    const alert = await this.prisma.collectionAlert.update({
      where: { id },
      data: {
        status: dto.status,
        message_template: dto.messageTemplate?.trim(),
        contacted_by_id: ([AlertStatus.CONTACTED, AlertStatus.RESOLVED] as AlertStatus[]).includes(dto.status) ? actorId : undefined,
        last_contacted_at: dto.status === AlertStatus.CONTACTED ? new Date() : undefined,
        resolved_at: dto.status === AlertStatus.RESOLVED ? new Date() : undefined,
      },
    });

    return alert;
  }

  async getDashboardStats() {
    const [studentsCount, groupsCount, paymentsSum, expensesSum, recentExpenses, periods] = await Promise.all([
      this.prisma.managedStudent.count({ where: { status: 'ACTIVE' } }),
      this.prisma.accountingGroup.count({ where: { active: true } }),
      this.prisma.accountingPayment.aggregate({
        _sum: { amount: true },
        where: { status: 'APPROVED' },
      }),
      this.prisma.companyExpense.aggregate({
        _sum: { amount: true },
        where: { status: 'APPROVED' },
      }),
      this.prisma.companyExpense.findMany({
        take: 5,
        orderBy: { spent_at: 'desc' },
      }),
      this.prisma.billingPeriod.findMany({
        orderBy: [
          { year: 'desc' },
          { month: 'desc' }
        ],
      })
    ]);

    const totalCollected = Number(paymentsSum._sum.amount || 0);
    const totalExpenses = Number(expensesSum._sum.amount || 0);

    // Generate chart data for the last 6 months concurrently
    const chartPromises = [];
    for (let i = 5; i >= 0; i--) {
      chartPromises.push((async () => {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const year = d.getFullYear();
        const month = d.getMonth() + 1; // 1-12
        
        const start = new Date(year, month - 1, 1);
        const end = new Date(year, month, 0, 23, 59, 59, 999);

        const [monthlyPayments, monthlyExpenses] = await Promise.all([
          this.prisma.accountingPayment.aggregate({
            _sum: { amount: true },
            where: { status: 'APPROVED', paid_at: { gte: start, lte: end } }
          }),
          this.prisma.companyExpense.aggregate({
            _sum: { amount: true },
            where: { status: 'APPROVED', spent_at: { gte: start, lte: end } }
          })
        ]);

        const monthName = d.toLocaleDateString('ar-EG', { month: 'short' });
        return {
          index: i, // to sort correctly later
          name: `${monthName} ${year}`,
          income: Number(monthlyPayments._sum.amount || 0),
          expense: Number(monthlyExpenses._sum.amount || 0)
        };
      })());
    }
    
    const chartResults = await Promise.all(chartPromises);
    const chartData = chartResults
      .sort((a, b) => b.index - a.index)
      .map(({ name, income, expense }) => ({ name, income, expense }));

    return {
      studentsCount,
      groupsCount,
      totalCollected,
      totalExpenses,
      recentExpenses,
      periods,
      chartData,
    };
  }

  async getReportsSummary(startDate?: string, endDate?: string) {
    const whereDate: any = {};
    if (startDate || endDate) {
      if (startDate) whereDate.gte = new Date(startDate);
      if (endDate) whereDate.lte = new Date(endDate);
    }

    const [paymentsSum, refundsSum, discountsSum, expensesSum] = await Promise.all([
      this.prisma.accountingPayment.aggregate({
        _sum: { amount: true },
        where: {
          status: 'APPROVED',
          ...(Object.keys(whereDate).length > 0 && { paid_at: whereDate }),
        },
      }),
      this.prisma.studentRefund.aggregate({
        _sum: { amount: true },
        where: {
          ...(Object.keys(whereDate).length > 0 && { refunded_at: whereDate }),
        },
      }),
      this.prisma.studentDiscount.aggregate({
        _sum: { amount: true },
        where: {
          ...(Object.keys(whereDate).length > 0 && { created_at: whereDate }),
        },
      }),
      this.prisma.companyExpense.aggregate({
        _sum: { amount: true },
        where: {
          status: 'APPROVED',
          ...(Object.keys(whereDate).length > 0 && { spent_at: whereDate }),
        },
      }),
    ]);

    const totalCollected = Number(paymentsSum._sum.amount || 0);
    const totalRefunds = Number(refundsSum._sum.amount || 0);
    const totalDiscounts = Number(discountsSum._sum.amount || 0);
    const totalExpenses = Number(expensesSum._sum.amount || 0);
    const netIncome = totalCollected - totalRefunds - totalExpenses;

    return {
      totalCollected,
      totalRefunds,
      totalDiscounts,
      totalExpenses,
      netIncome,
      startDate,
      endDate
    };
  }

  async getArrearsReport(periodId?: string, groupId?: string) {
    const charges = await this.prisma.monthlyCharge.findMany({
      where: {
        status: { in: [ChargeStatus.DUE, ChargeStatus.PARTIALLY_PAID] },
        ...(periodId && { period_id: periodId }),
        ...(groupId && { group_id: groupId }),
      },
      include: {
        student: true,
        group: true,
        period: true,
        allocations: {
          where: { payment: { status: AccountingPaymentStatus.APPROVED } },
        },
      },
      orderBy: [
        { period: { year: 'asc' } },
        { period: { month: 'asc' } },
        { group: { name: 'asc' } },
        { student: { full_name: 'asc' } },
      ],
    });

    const rows = charges
      .map((charge) => {
        const paid = charge.allocations.reduce(
          (sum, allocation) => sum.plus(allocation.amount),
          new Prisma.Decimal(0),
        );
        const outstanding = charge.net_amount.minus(paid);
        return {
          chargeId: charge.id,
          studentId: charge.student_id,
          studentName: charge.student.full_name,
          studentPhone: charge.student.student_phone,
          guardianPhone: charge.student.guardian_phone,
          studentStatus: charge.student.status,
          groupId: charge.group_id,
          groupName: charge.group.name,
          groupCode: charge.group.code,
          periodId: charge.period_id,
          year: charge.period.year,
          month: charge.period.month,
          sessionsCount: charge.sessions_count,
          netAmount: Number(charge.net_amount),
          paidAmount: Number(paid),
          outstandingAmount: Number(outstanding),
          chargeStatus: charge.status,
          dueDate: charge.due_date,
        };
      })
      .filter((row) => row.outstandingAmount > 0.001);

    const studentsMap = new Map<string, any>();
    const groupsMap = new Map<string, any>();
    const periodsMap = new Map<string, any>();

    for (const row of rows) {
      const student = studentsMap.get(row.studentId) ?? {
        studentId: row.studentId,
        studentName: row.studentName,
        studentPhone: row.studentPhone,
        guardianPhone: row.guardianPhone,
        studentStatus: row.studentStatus,
        groups: new Set<string>(),
        oldestPeriod: `${row.month}/${row.year}`,
        chargesCount: 0,
        totalDue: 0,
        totalPaid: 0,
        totalOutstanding: 0,
      };
      student.groups.add(row.groupName);
      student.chargesCount += 1;
      student.totalDue += row.netAmount;
      student.totalPaid += row.paidAmount;
      student.totalOutstanding += row.outstandingAmount;
      studentsMap.set(row.studentId, student);

      const group = groupsMap.get(row.groupId) ?? {
        groupId: row.groupId,
        groupName: row.groupName,
        groupCode: row.groupCode,
        students: new Set<string>(),
        chargesCount: 0,
        totalDue: 0,
        totalPaid: 0,
        totalOutstanding: 0,
      };
      group.students.add(row.studentId);
      group.chargesCount += 1;
      group.totalDue += row.netAmount;
      group.totalPaid += row.paidAmount;
      group.totalOutstanding += row.outstandingAmount;
      groupsMap.set(row.groupId, group);

      const periodKey = row.periodId;
      const period = periodsMap.get(periodKey) ?? {
        periodId: row.periodId,
        year: row.year,
        month: row.month,
        students: new Set<string>(),
        groups: new Set<string>(),
        chargesCount: 0,
        totalDue: 0,
        totalPaid: 0,
        totalOutstanding: 0,
      };
      period.students.add(row.studentId);
      period.groups.add(row.groupId);
      period.chargesCount += 1;
      period.totalDue += row.netAmount;
      period.totalPaid += row.paidAmount;
      period.totalOutstanding += row.outstandingAmount;
      periodsMap.set(periodKey, period);
    }

    const students = [...studentsMap.values()]
      .map((student) => ({
        ...student,
        groups: [...student.groups],
      }))
      .sort((a, b) => b.totalOutstanding - a.totalOutstanding);

    const groups = [...groupsMap.values()]
      .map((group) => ({
        ...group,
        studentsCount: group.students.size,
        students: undefined,
      }))
      .sort((a, b) => b.totalOutstanding - a.totalOutstanding);

    const periods = [...periodsMap.values()]
      .map((period) => ({
        ...period,
        studentsCount: period.students.size,
        groupsCount: period.groups.size,
        students: undefined,
        groups: undefined,
      }))
      .sort((a, b) => (a.year - b.year) || (a.month - b.month));

    const totals = rows.reduce(
      (acc, row) => ({
        totalDue: acc.totalDue + row.netAmount,
        totalPaid: acc.totalPaid + row.paidAmount,
        totalOutstanding: acc.totalOutstanding + row.outstandingAmount,
      }),
      { totalDue: 0, totalPaid: 0, totalOutstanding: 0 },
    );

    return {
      filters: { periodId, groupId },
      totals: {
        ...totals,
        studentsCount: students.length,
        groupsCount: groups.length,
        chargesCount: rows.length,
      },
      students,
      groups,
      periods,
      charges: rows,
    };
  }
}
