import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { AuthTokenService, REFRESH_TOKEN_TTL_MS } from './services/auth-token.service';
import { PasswordService } from './services/password.service';
import {
  AuthenticatedUser,
  IssuedSession,
  RequestMetadata,
  SafeUserRecord,
  UserWithPassword,
  toAuthenticatedUser,
} from './types/auth.types';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly authTokenService: AuthTokenService,
    private readonly passwordService: PasswordService,
  ) {}

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private includeDevToken(token: string, fieldName: string): Record<string, string> {
    if (process.env.NODE_ENV === 'production' || process.env.ALLOW_DEV_AUTH_TOKENS !== 'true') {
      return {};
    }
    return { [fieldName]: token };
  }

  private async findUserForLogin(email: string): Promise<UserWithPassword | null> {
    return this.prisma.user.findUnique({
      where: { email: this.normalizeEmail(email) },
      select: {
        id: true,
        name: true,
        email: true,
        password_hash: true,
        role: true,
        status: true,
        email_verified: true,
      },
    });
  }

  async validateUser(email: string, password: string): Promise<AuthenticatedUser | null> {
    const user = await this.findUserForLogin(email);
    if (!user || !(await this.passwordService.compare(password, user.password_hash))) {
      return null;
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User is not active');
    }

    if (process.env.REQUIRE_EMAIL_VERIFICATION === 'true' && !user.email_verified) {
      throw new UnauthorizedException('Email verification required');
    }

    return toAuthenticatedUser(user);
  }

  async login(user: SafeUserRecord, metadata: RequestMetadata = {}): Promise<IssuedSession> {
    const authenticatedUser = toAuthenticatedUser(user);
    const accessToken = this.authTokenService.createAccessToken(authenticatedUser);
    const refreshToken = this.authTokenService.createRefreshToken(authenticatedUser);

    await this.prisma.session.create({
      data: {
        user_id: authenticatedUser.id,
        refresh_token: this.authTokenService.hash(refreshToken),
        ip_address: metadata.ipAddress || 'unknown',
        device_info: metadata.userAgent || 'unknown',
        expires_at: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: authenticatedUser,
    };
  }

  async logout(refreshToken: string): Promise<{ loggedOut: true }> {
    await this.prisma.session.deleteMany({
      where: { refresh_token: this.authTokenService.hash(refreshToken) },
    });
    return { loggedOut: true };
  }

  async refreshTokens(
    userId: string,
    oldRefreshToken: string,
    metadata: RequestMetadata = {},
  ): Promise<IssuedSession> {
    const refreshTokenHash = this.authTokenService.hash(oldRefreshToken);
    const session = await this.prisma.session.findUnique({
      where: { refresh_token: refreshTokenHash },
      include: { user: true },
    });

    if (
      !session ||
      session.user_id !== userId ||
      session.expires_at < new Date() ||
      session.user.status !== 'ACTIVE'
    ) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const revoked = await this.prisma.session.deleteMany({
      where: { id: session.id, refresh_token: refreshTokenHash },
    });
    if (revoked.count !== 1) {
      throw new UnauthorizedException('Refresh token was already used');
    }

    return this.login(toAuthenticatedUser(session.user), metadata);
  }

  async verifyEmail(token: string): Promise<{ verified: true }> {
    const tokenHash = this.authTokenService.hash(token);
    const user = await this.prisma.user.findFirst({
      where: { email_verification_token: tokenHash },
    });

    if (!user) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        email_verified: true,
        email_verification_token: null,
      },
    });

    await this.audit.log({
      userId: user.id,
      action: 'EMAIL_VERIFIED',
      entity: 'user',
      entityId: user.id,
    });

    return { verified: true };
  }

  async resendVerification(
    email?: string,
    metadata: RequestMetadata = {},
  ): Promise<Record<string, string | true>> {
    if (!email) return { sent: true };

    const user = await this.prisma.user.findUnique({ where: { email: this.normalizeEmail(email) } });
    if (!user || user.email_verified) return { sent: true };

    const verificationToken = this.authTokenService.createOpaqueToken();
    await this.prisma.user.update({
      where: { id: user.id },
      data: { email_verification_token: this.authTokenService.hash(verificationToken) },
    });

    await this.audit.log({
      userId: user.id,
      action: 'EMAIL_VERIFICATION_RESENT',
      entity: 'user',
      entityId: user.id,
      payload: metadata,
    });

    return {
      sent: true,
      ...this.includeDevToken(verificationToken, 'dev_email_verification_token'),
    };
  }

  async forgotPassword(
    email: string,
    metadata: RequestMetadata = {},
  ): Promise<Record<string, string | true>> {
    const user = await this.prisma.user.findUnique({ where: { email: this.normalizeEmail(email) } });
    if (!user) return { sent: true };

    const resetToken = this.authTokenService.createOpaqueToken();
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password_reset_token: this.authTokenService.hash(resetToken),
        password_reset_expires_at: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    await this.audit.log({
      userId: user.id,
      action: 'PASSWORD_RESET_REQUESTED',
      entity: 'user',
      entityId: user.id,
      payload: metadata,
    });

    return {
      sent: true,
      ...this.includeDevToken(resetToken, 'dev_password_reset_token'),
    };
  }

  async resetPassword(
    token: string,
    password: string,
    metadata: RequestMetadata = {},
  ): Promise<{ reset: true }> {
    const tokenHash = this.authTokenService.hash(token);
    const user = await this.prisma.user.findFirst({
      where: {
        password_reset_token: tokenHash,
        password_reset_expires_at: { gt: new Date() },
      },
    });

    if (!user) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const passwordHash = await this.passwordService.hash(password);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          password_hash: passwordHash,
          password_reset_token: null,
          password_reset_expires_at: null,
        },
      }),
      this.prisma.session.deleteMany({ where: { user_id: user.id } }),
    ]);

    await this.audit.log({
      userId: user.id,
      action: 'PASSWORD_RESET_COMPLETED',
      entity: 'user',
      entityId: user.id,
      payload: metadata,
    });

    return { reset: true };
  }
}
