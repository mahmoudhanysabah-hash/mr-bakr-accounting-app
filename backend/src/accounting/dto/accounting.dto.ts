import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPhoneNumber,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  AccountingGroupType,
  AccountingPaymentMethod,
  AlertStatus,
  ChargeStatus,
  AcademicTrack,
  ManagedStudentStatus,
} from '@prisma/client';

export class CreateManagedStudentDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsString()
  @MinLength(2)
  fullName: string;

  @IsOptional()
  @IsString()
  studentPhone?: string;

  @IsOptional()
  @IsString()
  guardianName?: string;

  @IsOptional()
  @IsString()
  guardianPhone?: string;

  @IsOptional()
  @IsString()
  gradeLevel?: string;

  @IsOptional()
  @IsEnum(AcademicTrack)
  academicTrack?: AcademicTrack;

  @IsDateString()
  joinedAt: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateManagedStudentDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  fullName?: string;

  @IsOptional()
  @IsString()
  studentPhone?: string;

  @IsOptional()
  @IsString()
  guardianName?: string;

  @IsOptional()
  @IsString()
  guardianPhone?: string;

  @IsOptional()
  @IsString()
  gradeLevel?: string;

  @IsOptional()
  @IsEnum(AcademicTrack)
  academicTrack?: AcademicTrack;

  @IsOptional()
  @IsEnum(ManagedStudentStatus)
  status?: ManagedStudentStatus;

  @IsOptional()
  @IsDateString()
  pausedAt?: string;

  @IsOptional()
  @IsDateString()
  withdrawnAt?: string;

  @IsOptional()
  @IsString()
  exitReason?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateAccountingGroupDto {
  @IsString()
  code: string;

  @IsString()
  @MinLength(2)
  name: string;

  @IsEnum(AccountingGroupType)
  type: AccountingGroupType;

  @IsOptional()
  @IsString()
  teacherName?: string;

  @IsOptional()
  @IsString()
  level?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  defaultSessionPrice: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  defaultSessionsPerMonth: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  defaultStudentTarget?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  defaultRevenueTarget?: number;

  @IsOptional()
  @IsDateString()
  startsAt?: string;
}

export class UpdateAccountingGroupDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(AccountingGroupType)
  type?: AccountingGroupType;

  @IsOptional()
  @IsString()
  teacherName?: string;

  @IsOptional()
  @IsString()
  level?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  defaultSessionPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  defaultSessionsPerMonth?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  defaultStudentTarget?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  defaultRevenueTarget?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class BulkEnrollStudentsDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  studentIds: string[];

  @IsString()
  groupId: string;

  @IsDateString()
  startsAt: string;
}

export class EnrollStudentDto {
  @IsString()
  studentId: string;

  @IsString()
  groupId: string;

  @IsDateString()
  startsAt: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  customSessionPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  customSessionsPerMonth?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class TransferStudentDto {
  @IsString()
  enrollmentId: string;

  @IsString()
  toGroupId: string;

  @IsDateString()
  effectiveAt: string;

  @IsString()
  reason: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  customSessionPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  customSessionsPerMonth?: number;
}

export class EndEnrollmentDto {
  @IsDateString()
  effectiveAt: string;

  @IsString()
  reason: string;

  @IsOptional()
  @IsEnum(ManagedStudentStatus)
  studentStatus?: ManagedStudentStatus;
}

export class OpenBillingPeriodDto {
  @Type(() => Number)
  @IsInt()
  @Min(2020)
  year: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month: number;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GroupOverrideDto)
  groupOverrides?: GroupOverrideDto[];
}

export class GroupOverrideDto {
  @IsString()
  groupId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  sessionsCount: number;
}

export class CreateChargeFromEnrollmentDto {
  @IsString()
  periodId: string;

  @IsString()
  enrollmentId: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  sessionsCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sessionPrice?: number;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class PaymentAllocationDto {
  @IsString()
  chargeId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount: number;
}

export class CreateAccountingPaymentDto {
  @IsString()
  studentId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsEnum(AccountingPaymentMethod)
  method: AccountingPaymentMethod;

  @IsDateString()
  paidAt: string;

  @IsOptional()
  @IsString()
  externalReference?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentAllocationDto)
  allocations?: PaymentAllocationDto[];
}

export class UpdateAccountingPaymentDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @IsOptional()
  @IsEnum(AccountingPaymentMethod)
  method?: AccountingPaymentMethod;

  @IsOptional()
  @IsDateString()
  paidAt?: string;

  @IsOptional()
  @IsString()
  externalReference?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateStudentDiscountDto {
  @IsOptional()
  @IsString()
  chargeId?: string;

  @IsOptional()
  @IsString()
  studentId?: string;

  @IsOptional()
  @IsString()
  groupId?: string;

  @IsOptional()
  @IsString()
  periodId?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsString()
  @MinLength(3)
  reason: string;
}

export class CreateStudentRefundDto {
  @IsString()
  studentId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsString()
  @MinLength(3)
  reason: string;

  @IsEnum(AccountingPaymentMethod)
  method: AccountingPaymentMethod;

  @IsDateString()
  refundedAt: string;

  @IsOptional()
  @IsString()
  externalReference?: string;

  @IsOptional()
  @IsString()
  groupId?: string;

  @IsOptional()
  @IsString()
  periodId?: string;

  @IsOptional()
  @IsString()
  chargeId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  sessionsCount?: number;
}

export class CreateCompanyExpenseDto {
  @IsString()
  @MinLength(2)
  category: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsEnum(AccountingPaymentMethod)
  method: AccountingPaymentMethod;

  @IsDateString()
  spentAt: string;

  @IsString()
  @MinLength(3)
  description: string;

  @IsOptional()
  @IsString()
  externalReference?: string;
}

export class GenerateAlertsDto {
  @IsString()
  periodId: string;
}

export class UpdateAlertStatusDto {
  @IsEnum(AlertStatus)
  status: AlertStatus;

  @IsOptional()
  @IsString()
  messageTemplate?: string;
}
