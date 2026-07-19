import { IsEmail, IsEnum, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Role, UserStatus } from '@prisma/client';

const staffRoles = [Role.ADMIN, Role.FINANCE_MANAGER, Role.ACCOUNTANT, Role.ASSISTANT] as const;

export class CreateStaffUserDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).+$/, { message: 'Password must include uppercase, lowercase, number, and symbol' })
  password: string;

  @IsIn([...staffRoles])
  role: Role;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @IsString()
  phone?: string;
}

export class UpdateStaffUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).+$/, { message: 'Password must include uppercase, lowercase, number, and symbol' })
  password?: string;

  @IsOptional()
  @IsIn([...staffRoles])
  role?: Role;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @IsString()
  phone?: string;
}
