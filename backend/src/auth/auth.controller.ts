import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CookieOptions, Request, Response } from 'express';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ResendVerificationDto, VerifyEmailDto } from './dto/verify-email.dto';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import type { AuthenticatedRequest, AuthenticatedUser } from './types/auth.types';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private authCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
    };
  }

  private accessCookieOptions(): CookieOptions {
    return {
      ...this.authCookieOptions(),
      maxAge: 15 * 60 * 1000,
    };
  }

  private refreshCookieOptions(): CookieOptions {
    return {
      ...this.authCookieOptions(),
      maxAge: 7 * 24 * 60 * 60 * 1000,
    };
  }

  private requestMetadata(req: Request) {
    return {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    };
  }

  private readRefreshToken(req: Request): string | undefined {
    const cookieToken = req.cookies?.refresh_token;
    if (typeof cookieToken === 'string' && cookieToken) {
      return cookieToken;
    }

    const authorization = req.headers.authorization;
    if (!authorization) return undefined;
    const [scheme, token] = authorization.split(' ');
    return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(@Body() body: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const user = await this.authService.validateUser(body.email, body.password);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const session = await this.authService.login(user, this.requestMetadata(req));
    res.cookie('access_token', session.access_token, this.accessCookieOptions());
    res.cookie('refresh_token', session.refresh_token, this.refreshCookieOptions());

    return { user: session.user };
  }

  @Post('register')
  register(): never {
    throw new ForbiddenException('Public registration is disabled. Accounts must be created internally by an administrator.');
  }

  @HttpCode(HttpStatus.OK)
  @Post('verify-email')
  async verifyEmail(@Body() body: VerifyEmailDto) {
    return this.authService.verifyEmail(body.token);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('resend-verification')
  async resendVerification(@Body() body: ResendVerificationDto, @Req() req: Request) {
    return this.authService.resendVerification(body.email, this.requestMetadata(req));
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('forgot-password')
  async forgotPassword(@Body() body: ForgotPasswordDto, @Req() req: Request) {
    return this.authService.forgotPassword(body.email, this.requestMetadata(req));
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('reset-password')
  async resetPassword(@Body() body: ResetPasswordDto, @Req() req: Request) {
    return this.authService.resetPassword(body.token, body.password, this.requestMetadata(req));
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(JwtRefreshGuard)
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(@Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    const refreshToken = this.readRefreshToken(req);
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token missing');
    }

    const session = await this.authService.refreshTokens(
      req.user.id,
      refreshToken,
      this.requestMetadata(req),
    );
    res.cookie('access_token', session.access_token, this.accessCookieOptions());
    res.cookie('refresh_token', session.refresh_token, this.refreshCookieOptions());

    return { success: true };
  }

  @HttpCode(HttpStatus.OK)
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = this.readRefreshToken(req);
    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }

    res.clearCookie('access_token', this.authCookieOptions());
    res.clearCookie('refresh_token', this.authCookieOptions());
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getProfile(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }
}
