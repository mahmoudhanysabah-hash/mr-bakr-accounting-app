import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role, UserStatus } from '@prisma/client';
import { AuditService } from '../common/audit.service';
import { PasswordService } from '../auth/services/password.service';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStaffUserDto, UpdateStaffUserDto } from './dto/staff-user.dto';

@Injectable()
export class AdminUsersService {
  private readonly userSelect = {
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
  } satisfies Prisma.UserSelect;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly passwordService: PasswordService,
  ) {}

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
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

    if (!affectsActiveAdmin) return;

    const activeAdmins = await this.prisma.user.count({
      where: { role: Role.ADMIN, status: UserStatus.ACTIVE },
    });
    if (activeAdmins <= 1) {
      throw new BadRequestException('At least one active admin account is required');
    }
  }

  listUsers() {
    return this.prisma.user.findMany({
      select: this.userSelect,
      orderBy: { created_at: 'desc' },
    });
  }

  async createUser(dto: CreateStaffUserDto, actor: AuthenticatedUser) {
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
        password_hash: await this.passwordService.hash(dto.password),
        role: dto.role,
        status: dto.status ?? UserStatus.ACTIVE,
        email_verified: true,
        email_verification_token: null,
        password_reset_token: null,
        password_reset_expires_at: null,
        active_devices: 0,
      },
      select: this.userSelect,
    });

    await this.audit.log({
      userId: actor.id,
      action: 'ADMIN_USER_CREATED',
      entity: 'user',
      entityId: user.id,
      payload: { email: user.email, role: user.role, status: user.status },
    });

    return user;
  }

  async updateUser(id: string, dto: UpdateStaffUserDto, actor: AuthenticatedUser) {
    await this.ensureLastAdminIsSafe(id, dto.role, dto.status);

    const data: Prisma.UserUpdateInput = {};
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

    let passwordChanged = false;
    if (dto.password !== undefined && dto.password.trim()) {
      data.password_hash = await this.passwordService.hash(dto.password);
      passwordChanged = true;
    }

    const user = await this.prisma.$transaction(async (transaction) => {
      const updatedUser = await transaction.user.update({
        where: { id },
        data,
        select: this.userSelect,
      });
      if (passwordChanged) {
        await transaction.session.deleteMany({ where: { user_id: id } });
      }
      return updatedUser;
    });

    await this.audit.log({
      userId: actor.id,
      action: 'ADMIN_USER_UPDATED',
      entity: 'user',
      entityId: user.id,
      payload: {
        email: user.email,
        role: user.role,
        status: user.status,
        passwordChanged,
      },
    });

    return user;
  }
}