import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import * as bcrypt from 'bcrypt';
import { Role } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private audit: AuditService,
  ) { }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private issueToken() {
    return randomBytes(32).toString('hex');
  }

  private includeDevToken(token: string, fieldName: string) {
    return process.env.NODE_ENV === 'production' ? {} : { [fieldName]: token };
  }

  async validateUser(email: string, pass: string): Promise<any> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user && await bcrypt.compare(pass, user.password_hash)) {
      if (user.status !== 'ACTIVE') throw new UnauthorizedException('User is not active');
      if (process.env.REQUIRE_EMAIL_VERIFICATION === 'true' && !user.email_verified) {
        throw new UnauthorizedException('Email verification required');
      }
      const { password_hash, ...result } = user;
      return result;
    }
    return null;
  }

  async login(user: any, ipAddress?: string, userAgent?: string) {
    const payload = { email: user.email, sub: user.id, role: user.role };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_REFRESH_SECRET as string,
      expiresIn: '7d',
    });

    // Store the refresh token in a session
    await this.prisma.session.create({
      data: {
        user_id: user.id,
        refresh_token: this.hashToken(refreshToken),
        ip_address: ipAddress || 'unknown',
        device_info: userAgent || 'unknown',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      }
    });



    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        email_verified: user.email_verified,
      }
    };
  }

  async logout(refreshToken: string) {
    await this.prisma.session.deleteMany({
      where: { refresh_token: this.hashToken(refreshToken) }
    });
    return { loggedOut: true };
  }

  async refreshTokens(userId: string, oldRefreshToken: string, ipAddress?: string, userAgent?: string) {
    // Delete old token
    await this.prisma.session.deleteMany({
      where: { refresh_token: this.hashToken(oldRefreshToken) }
    });

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');

    return this.login(user, ipAddress, userAgent);
  }

  async register(data: any) {
    const existingUser = await this.prisma.user.findUnique({ where: { email: data.email } });
    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    const salt = await bcrypt.genSalt();
    const hash = await bcrypt.hash(data.password, salt);
    const verificationToken = this.issueToken();
    const verificationTokenHash = this.hashToken(verificationToken);

    const user = await this.prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        password_hash: hash,
        role: data.role || Role.STUDENT,
        email_verification_token: verificationTokenHash,
        profile: {
          create: {
            phone: data.phone || null,
          }
        }
      },
    });

    await this.audit.log({
      userId: user.id,
      action: 'USER_REGISTERED',
      entity: 'user',
      entityId: user.id,
      payload: { email: user.email },
    });



    const loginResult = await this.login(user);
    return {
      ...loginResult,
      email_verification_required: !user.email_verified,
      ...this.includeDevToken(verificationToken, 'dev_email_verification_token'),
    };
  }

  async verifyEmail(token: string) {
    const tokenHash = this.hashToken(token);
    const user = await this.prisma.user.findFirst({
      where: { email_verification_token: tokenHash },
    });

    if (!user) throw new BadRequestException('Invalid or expired verification token');

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

  async resendVerification(email?: string, ipAddress?: string, userAgent?: string) {
    if (!email) return { sent: true };

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.email_verified) return { sent: true };

    const verificationToken = this.issueToken();
    await this.prisma.user.update({
      where: { id: user.id },
      data: { email_verification_token: this.hashToken(verificationToken) },
    });

    await this.audit.log({
      userId: user.id,
      action: 'EMAIL_VERIFICATION_RESENT',
      entity: 'user',
      entityId: user.id,
      payload: { ipAddress, userAgent },
    });

    return {
      sent: true,
      ...this.includeDevToken(verificationToken, 'dev_email_verification_token'),
    };
  }

  async forgotPassword(email: string, ipAddress?: string, userAgent?: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return { sent: true };

    const resetToken = this.issueToken();
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password_reset_token: this.hashToken(resetToken),
        password_reset_expires_at: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    await this.audit.log({
      userId: user.id,
      action: 'PASSWORD_RESET_REQUESTED',
      entity: 'user',
      entityId: user.id,
      payload: { ipAddress, userAgent },
    });

    return {
      sent: true,
      ...this.includeDevToken(resetToken, 'dev_password_reset_token'),
    };
  }

  async resetPassword(token: string, password: string, ipAddress?: string, userAgent?: string) {
    const tokenHash = this.hashToken(token);
    const user = await this.prisma.user.findFirst({
      where: {
        password_reset_token: tokenHash,
        password_reset_expires_at: { gt: new Date() },
      },
    });

    if (!user) throw new BadRequestException('Invalid or expired reset token');

    const salt = await bcrypt.genSalt();
    const passwordHash = await bcrypt.hash(password, salt);

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
      payload: { ipAddress, userAgent },
    });

    return { reset: true };
  }
}
