import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsNumber, IsObject, IsOptional,
  IsString, IsUUID, Max, MaxLength, Min, ValidateIf, ValidateNested,
} from 'class-validator';
import { AttendanceStatus, TeachingAwardSource } from '@prisma/client';

class SheetAttendanceDto {
  @IsString()
  @MaxLength(64)
  version: string;

  @IsIn([AttendanceStatus.PRESENT, AttendanceStatus.ABSENT, AttendanceStatus.EXCUSED, AttendanceStatus.OTHER])
  status: AttendanceStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string | null;
}

export class SheetGradeDto {
  @ValidateIf((_obj, value) => value !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999999999.99)
  score: number | null;

  @ValidateIf((_obj, value) => value !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9999999999.99)
  maxScore: number | null;
}

class SheetAcademicDto {
  @IsString()
  @MaxLength(64)
  version: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => SheetGradeDto)
  homework?: SheetGradeDto;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => SheetGradeDto)
  classwork?: SheetGradeDto;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  mistakes?: string | null;
}

export class SheetAwardDto {
  @IsUUID('4')
  id: string;

  @IsIn([TeachingAwardSource.HOMEWORK, TeachingAwardSource.CLASSWORK])
  source: TeachingAwardSource;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9999999999.99)
  amount: number;
}

class SheetRowDto {
  @IsString()
  @MaxLength(100)
  studentId: string;

  @IsString()
  @MaxLength(100)
  enrollmentId: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => SheetAttendanceDto)
  attendance?: SheetAttendanceDto;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => SheetAcademicDto)
  academic?: SheetAcademicDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => SheetAwardDto)
  awards?: SheetAwardDto[];
}

export class SaveLessonSheetDto {
  @IsUUID('4')
  requestId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(250)
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => SheetRowDto)
  rows: SheetRowDto[];
}

export class RemoveTeachingEnrollmentDto {
  @IsString()
  @MaxLength(100)
  lastSessionId: string;

  @IsString()
  @MaxLength(1000)
  reason: string;
}
