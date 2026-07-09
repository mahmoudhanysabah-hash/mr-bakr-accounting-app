import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  AcademicActivityType,
  AcademicImprovementStatus,
  AssistantAssignmentStatus,
  AssistantResponsibility,
  AttendanceStatus,
  GuardianContactStatus,
  TeachingSessionStatus,
} from '@prisma/client';

export class AssignAssistantGroupDto {
  @IsString()
  assistantId: string;

  @IsString()
  groupId: string;

  @IsEnum(AssistantResponsibility)
  responsibility: AssistantResponsibility;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateAssignmentStatusDto {
  @IsEnum(AssistantAssignmentStatus)
  status: AssistantAssignmentStatus;

  @IsOptional()
  @IsDateString()
  endsAt?: string;
}

export class AssignAssistantStudentsDto {
  @IsString()
  assistantId: string;

  @IsString()
  groupId: string;

  @IsEnum(AssistantResponsibility)
  responsibility: AssistantResponsibility;

  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  studentIds: string[];

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateTeachingSessionDto {
  @IsString()
  groupId: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsDateString()
  sessionDate: string;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsString()
  attendanceAssistantId?: string;

  @IsOptional()
  @IsString()
  guardianContactAssistantId?: string;

  @IsOptional()
  @IsString()
  academicAssistantId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateTeachingSessionStatusDto {
  @IsEnum(TeachingSessionStatus)
  status: TeachingSessionStatus;
}

export class AttendanceRecordDto {
  @IsString()
  studentId: string;

  @IsEnum(AttendanceStatus)
  status: AttendanceStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minutesLate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  leftEarlyMinutes?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpsertAttendanceDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttendanceRecordDto)
  @ArrayMinSize(1)
  records: AttendanceRecordDto[];
}

export class CreateGuardianContactDto {
  @IsOptional()
  @IsString()
  attendanceId?: string;

  @IsString()
  sessionId: string;

  @IsString()
  studentId: string;

  @IsEnum(GuardianContactStatus)
  status: GuardianContactStatus;

  @IsOptional()
  @IsString()
  guardianPhone?: string;

  @IsOptional()
  @IsString()
  response?: string;

  @IsOptional()
  @IsDateString()
  contactedAt?: string;

  @IsOptional()
  @IsDateString()
  followUpAt?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateAcademicFollowUpDto {
  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsString()
  studentId: string;

  @IsOptional()
  @IsString()
  groupId?: string;

  @IsDateString()
  entryDate: string;

  @IsEnum(AcademicActivityType)
  activityType: AcademicActivityType;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  score?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxScore?: number;

  @IsOptional()
  @IsString()
  questionType?: string;

  @IsOptional()
  @IsString()
  errorType?: string;

  @IsOptional()
  @IsString()
  errorReason?: string;

  @IsOptional()
  @IsString()
  correction?: string;

  @IsOptional()
  @IsString()
  assistantAction?: string;

  @IsOptional()
  @IsEnum(AcademicImprovementStatus)
  result?: AcademicImprovementStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}
