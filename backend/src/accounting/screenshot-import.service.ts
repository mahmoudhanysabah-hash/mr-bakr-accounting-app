import { BadRequestException, Injectable } from '@nestjs/common';
import {
  AccountingGroupType,
  AccountingPaymentMethod,
  AccountingPaymentStatus,
  BillingPeriodStatus,
  ChargeStatus,
  EnrollmentStatus,
  ManagedStudentStatus,
  Prisma,
} from '@prisma/client';
import { createHash } from 'crypto';
import { createWorker } from 'tesseract.js';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';

type ScreenshotImportRow = {
  studentName: string;
  groupName: string;
  year: number;
  month: number;
  sessionsCount: number;
  sessionPrice: number;
  dueAmount?: number;
  paidAmount: number;
  paymentMethod?: AccountingPaymentMethod;
  studentPhone?: string;
  guardianPhone?: string;
};

type ScreenshotImportPayload = {
  sourceName?: string;
  rows: ScreenshotImportRow[];
};

type ScreenshotAnalyzeOptions = {
  year?: string | number;
  month?: string | number;
  sessionPrice?: string | number;
};

type OcrWord = {
  text: string;
  confidence?: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
};

type OcrLine = {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  words: OcrWord[];
};

@Injectable()
export class ScreenshotImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async analyzeImage(file: Express.Multer.File, options: ScreenshotAnalyzeOptions = {}) {
    if (!file?.buffer?.length) throw new BadRequestException('Image file is required');

    const year = Number(options.year || 2025);
    const month = Number(options.month || 1);
    const sessionPrice = Number(options.sessionPrice || 250);
    if (!year || month < 1 || month > 12 || sessionPrice <= 0) {
      throw new BadRequestException('Invalid analysis options');
    }

    const worker = await createWorker('eng');
    try {
      await worker.setParameters({
        preserve_interword_spaces: '1',
      });
      const { data } = await worker.recognize(file.buffer, {}, { blocks: true, text: true });
      const parsed = this.parseOcrData(data, { year, month, sessionPrice });
      return {
        success: true,
        result: {
          fileName: file.originalname,
          confidence: Math.round(Number(data.confidence || 0)),
          rawText: String(data.text || '').slice(0, 10000),
          ...parsed,
        },
      };
    } finally {
      await worker.terminate();
    }
  }

  async importRows(payload: ScreenshotImportPayload, actorId?: string) {
    const rows = this.normalizeRows(payload.rows || []);
    if (!rows.length) throw new BadRequestException('No rows to import');

    const result = await this.prisma.$transaction(async (tx) => {
      const groups = new Map<string, any>();
      const students = new Map<string, any>();
      const periods = new Map<string, any>();
      const plans = new Map<string, any>();
      const enrollments = new Map<string, any>();
      let charges = 0;
      let updatedCharges = 0;
      let payments = 0;
      let skippedPayments = 0;
      let allocations = 0;

      for (const row of rows) {
        const groupKey = this.key(row.groupName);
        if (!groups.has(groupKey)) {
          const group = await tx.accountingGroup.upsert({
            where: { code: this.code('GRP', row.groupName) },
            update: {
              name: row.groupName,
              active: true,
              default_session_price: new Prisma.Decimal(row.sessionPrice),
              default_sessions_per_month: row.sessionsCount,
            },
            create: {
              code: this.code('GRP', row.groupName),
              name: row.groupName,
              type: AccountingGroupType.REGULAR,
              active: true,
              default_session_price: new Prisma.Decimal(row.sessionPrice),
              default_sessions_per_month: row.sessionsCount,
            },
          });
          groups.set(groupKey, group);
        }

        const group = groups.get(groupKey);
        const studentKey = `${this.key(row.studentName)}|${this.digits(row.studentPhone || row.guardianPhone || '')}`;
        if (!students.has(studentKey)) {
          const studentCode = this.code('STU', `${row.studentName}-${row.studentPhone || row.guardianPhone || ''}`);
          const student = await tx.managedStudent.upsert({
            where: { code: studentCode },
            update: {
              full_name: row.studentName,
              student_phone: row.studentPhone,
              guardian_phone: row.guardianPhone,
              status: ManagedStudentStatus.ACTIVE,
            },
            create: {
              code: studentCode,
              full_name: row.studentName,
              student_phone: row.studentPhone,
              guardian_phone: row.guardianPhone,
              joined_at: new Date(Date.UTC(row.year, row.month - 1, 1)),
              status: ManagedStudentStatus.ACTIVE,
            },
          });
          students.set(studentKey, student);
        }

        const student = students.get(studentKey);
        const periodKey = `${row.year}-${row.month}`;
        if (!periods.has(periodKey)) {
          const period = await tx.billingPeriod.upsert({
            where: { year_month: { year: row.year, month: row.month } },
            update: {},
            create: {
              year: row.year,
              month: row.month,
              status: BillingPeriodStatus.CLOSED,
              opened_at: new Date(Date.UTC(row.year, row.month - 1, 1)),
              closed_at: new Date(),
              opened_by_id: actorId,
              closed_by_id: actorId,
            },
          });
          periods.set(periodKey, period);
        }

        const period = periods.get(periodKey);
        const planKey = `${period.id}|${group.id}`;
        if (!plans.has(planKey)) {
          const plan = await tx.monthlyGroupPlan.upsert({
            where: {
              period_id_group_id: {
                period_id: period.id,
                group_id: group.id,
              },
            },
            update: {
              sessions_count: row.sessionsCount,
              session_price: new Prisma.Decimal(row.sessionPrice),
            },
            create: {
              period_id: period.id,
              group_id: group.id,
              sessions_count: row.sessionsCount,
              session_price: new Prisma.Decimal(row.sessionPrice),
            },
          });
          plans.set(planKey, plan);
        }

        const enrollmentKey = `${student.id}|${group.id}`;
        if (!enrollments.has(enrollmentKey)) {
          let enrollment = await tx.studentEnrollment.findFirst({
            where: { student_id: student.id, group_id: group.id, status: EnrollmentStatus.ACTIVE },
          });
          if (!enrollment) {
            enrollment = await tx.studentEnrollment.create({
              data: {
                student_id: student.id,
                group_id: group.id,
                starts_at: new Date(Date.UTC(row.year, row.month - 1, 1)),
                status: EnrollmentStatus.ACTIVE,
              },
            });
          }
          enrollments.set(enrollmentKey, enrollment);
        }

        const dueAmount = row.dueAmount ?? row.sessionsCount * row.sessionPrice;
        const paidAmount = row.paidAmount || 0;
        const due = new Prisma.Decimal(dueAmount);
        const paid = new Prisma.Decimal(paidAmount);
        const allocated = paid.lessThan(due) ? paid : due;

        const enrollment = enrollments.get(enrollmentKey);
        let charge = await tx.monthlyCharge.findUnique({
          where: {
            period_id_enrollment_id: {
              period_id: period.id,
              enrollment_id: enrollment.id,
            },
          },
          include: { allocations: true },
        });

        if (charge) {
          const existingPaid = charge.allocations.reduce((sum: number, allocation: any) => sum + Number(allocation.amount), 0);
          charge = await tx.monthlyCharge.update({
            where: { id: charge.id },
            data: {
              monthly_plan_id: plans.get(planKey).id,
              sessions_count: row.sessionsCount,
              session_price: new Prisma.Decimal(row.sessionPrice),
              gross_amount: due,
              net_amount: due,
              due_date: new Date(Date.UTC(row.year, row.month - 1, 10)),
              status: this.chargeStatus(Math.min(existingPaid, dueAmount), dueAmount),
              notes: `Updated from screenshot${payload.sourceName ? `: ${payload.sourceName}` : ''}`,
            },
            include: { allocations: true },
          });
          updatedCharges += 1;
        } else {
          charge = await tx.monthlyCharge.create({
            data: {
              period_id: period.id,
              monthly_plan_id: plans.get(planKey).id,
              student_id: student.id,
              enrollment_id: enrollment.id,
              group_id: group.id,
              sessions_count: row.sessionsCount,
              session_price: new Prisma.Decimal(row.sessionPrice),
              gross_amount: due,
              net_amount: due,
              due_date: new Date(Date.UTC(row.year, row.month - 1, 10)),
              status: this.chargeStatus(Number(allocated), dueAmount),
              notes: `Imported from screenshot${payload.sourceName ? `: ${payload.sourceName}` : ''}`,
            },
            include: { allocations: true },
          });
          charges += 1;
        }

        if (paidAmount > 0) {
          const alreadyAllocated = charge.allocations.reduce(
            (sum: number, allocation: any) => sum + Number(allocation.amount),
            0,
          );
          const paymentDelta = paidAmount - alreadyAllocated;
          if (paymentDelta <= 0.009) {
            skippedPayments += 1;
            continue;
          }
          const delta = new Prisma.Decimal(paymentDelta);
          const remainingDue = due.minus(new Prisma.Decimal(alreadyAllocated));
          const allocationAmount = delta.lessThan(remainingDue) ? delta : remainingDue;

          const payment = await tx.accountingPayment.create({
            data: {
              student_id: student.id,
              amount: delta,
              method: row.paymentMethod || AccountingPaymentMethod.CASH,
              status: AccountingPaymentStatus.APPROVED,
              paid_at: new Date(Date.UTC(row.year, row.month - 1, 10)),
              recorded_by_id: actorId,
              reviewed_by_id: actorId,
              reviewed_at: new Date(),
              notes: `Imported from screenshot${payload.sourceName ? `: ${payload.sourceName}` : ''}`,
            },
          });
          payments += 1;

          if (allocationAmount.greaterThan(0)) {
            await tx.paymentAllocation.create({
              data: {
                payment_id: payment.id,
                charge_id: charge.id,
                amount: allocationAmount,
              },
            });
            allocations += 1;
          }

          const credit = delta.minus(allocationAmount);
          if (credit.greaterThan(0)) {
            await tx.managedStudent.update({
              where: { id: student.id },
              data: { credit_balance: { increment: credit } },
            });
          }
        }
      }

      return {
        students: students.size,
        groups: groups.size,
        periods: periods.size,
        charges,
        updatedCharges,
        payments,
        skippedPayments,
        allocations,
      };
    }, { maxWait: 10000, timeout: 120000 });

    await this.audit.log({
      userId: actorId,
      action: 'ACCOUNTING_SCREENSHOT_IMPORT_CONFIRMED',
      entity: 'accounting_import',
      entityId: payload.sourceName || 'screenshot',
      payload: { sourceName: payload.sourceName, result },
    });

    return { success: true, result };
  }

  private normalizeRows(rows: ScreenshotImportRow[]) {
    return rows
      .map((row) => {
        const groupName = String(row.groupName || '').trim();
        const sessionPrice = Number(row.sessionPrice || 250);
        const sessionsCount = Number(row.sessionsCount || this.inferSessionsFromGroup(groupName) || 1);
        return {
          ...row,
          studentName: String(row.studentName || '').trim(),
          groupName,
          year: Number(row.year || 2025),
          month: Number(row.month),
          sessionsCount,
          sessionPrice,
          dueAmount: row.dueAmount === undefined ? undefined : Number(row.dueAmount),
          paidAmount: Number(row.paidAmount || 0),
        };
      })
      .filter((row) => {
        return (
          row.studentName &&
          row.groupName &&
          row.year >= 2020 &&
          row.month >= 1 &&
          row.month <= 12 &&
          row.sessionsCount > 0 &&
          row.sessionPrice >= 0
        );
      });
  }

  private parseOcrData(data: any, defaults: { year: number; month: number; sessionPrice: number }) {
    const lines = this.flattenOcrLines(data);
    const allWords = lines.flatMap((line) =>
      line.words.map((word) => ({ ...word, lineBox: line.bbox, lineText: line.text })),
    );
    const maxX = Math.max(1, ...allWords.map((word) => word.bbox.x1));
    const maxY = Math.max(1, ...allWords.map((word) => word.bbox.y1));

    const headers = allWords
      .map((word) => ({ ...word, groupName: this.normalizeGroupHeader(word.text) }))
      .filter((word) => word.groupName)
      .sort((a, b) => (a.bbox.y0 - b.bbox.y0) || (a.bbox.x0 - b.bbox.x0));

    if (!headers.length) {
      return {
        rows: [],
        groups: [],
        summary: { rows: 0, groups: 0, warnings: 1 },
        warnings: ['لم أتعرف على أسماء جروبات واضحة في الصورة.'],
      };
    }

    const columnCenters = this.clusterNumbers(headers.map((header) => this.centerX(header.bbox)), 90);
    const groups = headers.map((header) => {
      const center = this.centerX(header.bbox);
      const columnIndex = this.nearestIndex(columnCenters, center);
      const left = columnIndex === 0 ? 0 : Math.floor((columnCenters[columnIndex - 1] + columnCenters[columnIndex]) / 2);
      const right =
        columnIndex === columnCenters.length - 1
          ? maxX + 10
          : Math.floor((columnCenters[columnIndex] + columnCenters[columnIndex + 1]) / 2);
      const nextInColumn = headers.find((other) => {
        if (other === header) return false;
        return other.bbox.y0 > header.bbox.y0 + 35 && this.nearestIndex(columnCenters, this.centerX(other.bbox)) === columnIndex;
      });
      return {
        name: header.groupName as string,
        rawName: header.text,
        left,
        right,
        top: header.bbox.y1 + 8,
        bottom: nextInColumn ? nextInColumn.bbox.y0 - 6 : maxY + 10,
      };
    });

    const parsedRows = groups.flatMap((group) => this.parseGroupRows(lines, group, defaults));
    const warnings = [
      ...groups
        .filter((group) => !this.inferSessionsFromGroup(group.name))
        .map((group) => `الجروب ${group.name} بدون نوع حصص واضح؛ راجع عدد الحصص قبل التسجيل.`),
      ...parsedRows
        .filter((row) => row.possibleSibling)
        .slice(0, 12)
        .map((row) => `الصف "${row.studentName}" يبدو أنه يحتوي على أخوات؛ راجع تقسيم الاسم والمبلغ.`),
    ];

    const groupSummary = groups.map((group) => {
      const rows = parsedRows.filter((row) => row.groupName === group.name);
      return {
        groupName: group.name,
        students: rows.length,
        due: rows.reduce((sum, row) => sum + row.dueAmount, 0),
        paid: rows.reduce((sum, row) => sum + row.paidAmount, 0),
      };
    });

    return {
      rows: parsedRows,
      groups: groupSummary,
      summary: {
        rows: parsedRows.length,
        groups: groupSummary.length,
        warnings: warnings.length,
      },
      warnings,
    };
  }

  private flattenOcrLines(data: any): OcrLine[] {
    const lines: OcrLine[] = [];
    for (const block of data.blocks || []) {
      for (const paragraph of block.paragraphs || []) {
        for (const line of paragraph.lines || []) {
          lines.push({
            text: String(line.text || '').trim(),
            bbox: line.bbox,
            words: (line.words || []).map((word: any) => ({
              text: String(word.text || '').trim(),
              confidence: word.confidence,
              bbox: word.bbox,
            })),
          });
        }
      }
    }
    return lines;
  }

  private parseGroupRows(
    lines: OcrLine[],
    group: { name: string; left: number; right: number; top: number; bottom: number },
    defaults: { year: number; month: number; sessionPrice: number },
  ) {
    const rows: Array<ScreenshotImportRow & { possibleSibling?: boolean; confidence?: number; rawText?: string }> = [];
    const defaultSessions = this.inferSessionsFromGroup(group.name);
    for (const line of lines) {
      const centerY = (line.bbox.y0 + line.bbox.y1) / 2;
      if (centerY < group.top || centerY > group.bottom) continue;

      const words = line.words.filter((word) => {
        const x = this.centerX(word.bbox);
        return x >= group.left && x <= group.right;
      });
      const parsed = this.parseOcrRowWords(words);
      if (!parsed) continue;

      const dueAmount = parsed.targetAmount;
      const paidAmount = parsed.inAmount;
      const sessionsFromDue =
        dueAmount > 0 && dueAmount % defaults.sessionPrice === 0
          ? dueAmount / defaults.sessionPrice
          : undefined;
      rows.push({
        studentName: parsed.studentName,
        groupName: group.name,
        year: defaults.year,
        month: defaults.month,
        sessionsCount: sessionsFromDue && sessionsFromDue <= 20 ? sessionsFromDue : defaultSessions || 1,
        sessionPrice: defaults.sessionPrice,
        dueAmount,
        paidAmount,
        paymentMethod: AccountingPaymentMethod.CASH,
        possibleSibling: parsed.studentName.includes('/'),
        confidence: parsed.confidence,
        rawText: parsed.rawText,
      });
    }
    return rows;
  }

  private parseOcrRowWords(words: OcrWord[]) {
    if (!words.length) return null;
    const cleanWords = words
      .map((word) => ({ ...word, cleaned: this.cleanOcrToken(word.text) }))
      .filter((word) => word.cleaned && !['name', 'in', 'target'].includes(word.cleaned.toLowerCase()));
    if (!cleanWords.length) return null;

    const amountIndexes = cleanWords
      .map((word, index) => ({ index, amount: this.parseAmount(word.cleaned) }))
      .filter((item) => item.amount !== undefined);

    const hasPass = cleanWords.some((word) => word.cleaned.toLowerCase() === 'pass');
    const firstAmountIndex = amountIndexes[0]?.index ?? cleanWords.length;
    const name = cleanWords
      .slice(0, firstAmountIndex)
      .map((word) => word.cleaned)
      .filter((token) => this.isNameToken(token))
      .join(' ')
      .replace(/\s+\/\s+/g, '/')
      .replace(/\s+/g, ' ')
      .trim();

    if (!name || !/[A-Za-z\u0600-\u06ff]/.test(name)) return null;

    if (!amountIndexes.length && !hasPass) return null;
    const amounts = amountIndexes.map((item) => item.amount as number);
    const inAmount = hasPass && !amounts.length ? 0 : amounts[0] ?? 0;
    const targetAmount = hasPass && amounts.length < 2 ? inAmount : amounts[1] ?? amounts[0] ?? 0;
    const confidence = Math.round(
      cleanWords.reduce((sum, word) => sum + Number(word.confidence || 0), 0) / cleanWords.length,
    );

    return {
      studentName: name,
      inAmount,
      targetAmount,
      confidence,
      rawText: cleanWords.map((word) => word.text).join(' '),
    };
  }

  private normalizeGroupHeader(value: string) {
    const compact = String(value || '').replace(/\s+/g, '').replace(/[\[\]{}]/g, '');
    const match = compact.match(/B\d+/i);
    if (!match) return null;
    const base = match[0].toUpperCase();
    if (/9[&83]?10|9810|9310/i.test(compact)) return `${base}(9&10)`;
    if (/11[&8]?12|11812/i.test(compact)) return `${base}(11&12)`;
    return base;
  }

  private cleanOcrToken(value: string) {
    return String(value || '')
      .replace(/[“”"']/g, '')
      .replace(/^[\[\]{}()|!lI\-=~_.,:;]+/, '')
      .replace(/[\[\]{}()|!lI\-=~_.,:;]+$/, '')
      .trim();
  }

  private parseAmount(value: string) {
    const compact = String(value || '').replace(/[^\d]/g, '');
    if (!compact) return undefined;
    if (compact === '0') return 0;
    if (compact.length < 3 || compact.length > 5) return undefined;
    const amount = Number(compact);
    return Number.isFinite(amount) ? amount : undefined;
  }

  private isNameToken(value: string) {
    if (!value) return false;
    if (/^\d+$/.test(value)) return false;
    if (/^[A-Za-z]\d+$/.test(value)) return false;
    if (/^(pass|target|name|in)$/i.test(value)) return false;
    if (!/[A-Za-z\u0600-\u06ff/]/.test(value)) return false;
    return true;
  }

  private clusterNumbers(values: number[], threshold: number) {
    const sorted = [...values].sort((a, b) => a - b);
    const clusters: number[][] = [];
    for (const value of sorted) {
      const last = clusters[clusters.length - 1];
      if (!last || Math.abs(this.average(last) - value) > threshold) {
        clusters.push([value]);
      } else {
        last.push(value);
      }
    }
    return clusters.map((cluster) => this.average(cluster));
  }

  private nearestIndex(values: number[], target: number) {
    return values.reduce((best, value, index) => {
      return Math.abs(value - target) < Math.abs(values[best] - target) ? index : best;
    }, 0);
  }

  private average(values: number[]) {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  private centerX(bbox: { x0: number; x1: number }) {
    return (bbox.x0 + bbox.x1) / 2;
  }

  private inferSessionsFromGroup(groupName: string) {
    const normalized = String(groupName || '').replace(/\s+/g, '').replace(/%/g, '&');
    if (normalized.includes('9&10')) return 8;
    if (normalized.includes('11&12')) return 12;
    return undefined;
  }

  private chargeStatus(paid: number, due: number) {
    if (paid >= due) return ChargeStatus.PAID;
    if (paid > 0) return ChargeStatus.PARTIALLY_PAID;
    return ChargeStatus.DUE;
  }

  private code(prefix: string, value: string) {
    const hash = createHash('sha1').update(this.key(value)).digest('hex').slice(0, 12).toUpperCase();
    return `${prefix}-${hash}`;
  }

  private key(value: string) {
    return String(value || '')
      .toLowerCase()
      .replace(/[أإآ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .replace(/[ًٌٍَُِّْ]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private digits(value: string) {
    return String(value || '').replace(/\D/g, '');
  }
}
