import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsEmail, IsEnum, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import * as bcrypt from 'bcrypt';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuditService } from '../common/audit.service';
import { Role, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const accountingRoles = [Role.ADMIN, Role.FINANCE_MANAGER, Role.ACCOUNTANT] as const;

class CreateAdminUserDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsIn([...accountingRoles])
  role: Role;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @IsString()
  phone?: string;
}

class UpdateAdminUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @IsOptional()
  @IsIn([...accountingRoles])
  role?: Role;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @IsString()
  phone?: string;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/users')
export class AdminUsersController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  private userSelect() {
    return {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      status: true,
      email_verified: true,
      created_at: true,
      updated_at: true,
      profile: true,
    } as const;
  }

  private async ensureUserExists(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  private async ensureLastAdminIsSafe(
    targetUserId: string,
    nextRole?: Role,
    nextStatus?: UserStatus,
  ) {
    const current = await this.ensureUserExists(targetUserId);
    const roleWillChangeAwayFromAdmin = nextRole !== undefined && nextRole !== Role.ADMIN;
    const statusWillStopActiveAdmin = nextStatus !== undefined && nextStatus !== UserStatus.ACTIVE;
    const affectsActiveAdmin =
      current.role === Role.ADMIN &&
      current.status === UserStatus.ACTIVE &&
      (roleWillChangeAwayFromAdmin || statusWillStopActiveAdmin);

    if (!affectsActiveAdmin) {
      return;
    }

    const activeAdmins = await this.prisma.user.count({
      where: { role: Role.ADMIN, status: UserStatus.ACTIVE },
    });
    if (activeAdmins <= 1) {
      throw new BadRequestException('At least one active admin account is required');
    }
  }

  @Get()
  async listUsers() {
    return this.prisma.user.findMany({
      select: this.userSelect(),
      orderBy: { created_at: 'desc' }
    });
  }

  @Post()
  async createUser(@Body() dto: CreateAdminUserDto, @CurrentUser() actor: any) {
    const email = this.normalizeEmail(dto.email);
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('Email already exists');
    }

    const user = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        email,
        phone: dto.phone?.trim() || null,
        password_hash: await bcrypt.hash(dto.password, 12),
        role: dto.role,
        status: dto.status ?? UserStatus.ACTIVE,
        email_verified: true,
        email_verification_token: null,
        password_reset_token: null,
        password_reset_expires_at: null,
        active_devices: 0,
      },
      select: this.userSelect(),
    });

    await this.audit.log({
      userId: actor?.id,
      action: 'ADMIN_USER_CREATED',
      entity: 'user',
      entityId: user.id,
      payload: { email: user.email, role: user.role, status: user.status },
    });

    return user;
  }

  @Patch(':id')
  async updateUser(
    @Param('id') id: string,
    @Body() dto: UpdateAdminUserDto,
    @CurrentUser() actor: any,
  ) {
    await this.ensureLastAdminIsSafe(id, dto.role, dto.status);

    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.email !== undefined) {
      const email = this.normalizeEmail(dto.email);
      const existing = await this.prisma.user.findUnique({ where: { email } });
      if (existing && existing.id !== id) {
        throw new ConflictException('Email already exists');
      }
      data.email = email;
    }
    if (dto.phone !== undefined) data.phone = dto.phone.trim() || null;
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.password !== undefined && dto.password.trim()) {
      data.password_hash = await bcrypt.hash(dto.password, 12);
      await this.prisma.session.deleteMany({ where: { user_id: id } });
    }

    const user = await this.prisma.user.update({
      where: { id },
      data,
      select: this.userSelect(),
    });

    await this.audit.log({
      userId: actor?.id,
      action: 'ADMIN_USER_UPDATED',
      entity: 'user',
      entityId: user.id,
      payload: {
        email: user.email,
        role: user.role,
        status: user.status,
        passwordChanged: Boolean(data.password_hash),
      },
    });

    return user;
  }
}
