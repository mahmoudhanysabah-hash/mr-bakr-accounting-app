import { Controller, Post, Body, UnauthorizedException, HttpCode, HttpStatus, Get, UseGuards, Req, Res } from '@nestjs/common';
import { CookieOptions, Response } from 'express';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ResendVerificationDto, VerifyEmailDto } from './dto/verify-email.dto';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { CurrentUser } from './decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

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

  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(@Body() body: LoginDto, @Req() req: any, @Res({ passthrough: true }) res: Response) {
    const user = await this.authService.validateUser(body.email, body.password);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const ip = req.ip;
    const userAgent = req.headers['user-agent'];
    const loginData = await this.authService.login(user, ip, userAgent);
    
    res.cookie('access_token', loginData.access_token, this.accessCookieOptions());
    res.cookie('refresh_token', loginData.refresh_token, this.refreshCookieOptions());
    
    return {
      user: loginData.user,
    };
  }

  @Post('register')
  async register(@Body() body: RegisterDto, @Req() req: any) {
    throw new UnauthorizedException('Public registration is disabled. Accounts must be created internally by an administrator.');
  }

  @HttpCode(HttpStatus.OK)
  @Post('verify-email')
  async verifyEmail(@Body() body: VerifyEmailDto) {
    return this.authService.verifyEmail(body.token);
  }

  @HttpCode(HttpStatus.OK)
  @Post('resend-verification')
  async resendVerification(@Body() body: ResendVerificationDto, @Req() req: any) {
    return this.authService.resendVerification(body.email, req.ip, req.headers['user-agent']);
  }

  @HttpCode(HttpStatus.OK)
  @Post('forgot-password')
  async forgotPassword(@Body() body: ForgotPasswordDto, @Req() req: any) {
    return this.authService.forgotPassword(body.email, req.ip, req.headers['user-agent']);
  }

  @HttpCode(HttpStatus.OK)
  @Post('reset-password')
  async resetPassword(@Body() body: ResetPasswordDto, @Req() req: any) {
    return this.authService.resetPassword(body.token, body.password, req.ip, req.headers['user-agent']);
  }

  @UseGuards(JwtRefreshGuard)
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    const user = req.user;
    const refreshToken = req.cookies?.['refresh_token'] || req.headers.authorization?.replace('Bearer ', '').trim();
    const ip = req.ip;
    const userAgent = req.headers['user-agent'];
    const refreshData = await this.authService.refreshTokens(user.id, refreshToken, ip, userAgent);
    
    res.cookie('access_token', refreshData.access_token, this.accessCookieOptions());
    res.cookie('refresh_token', refreshData.refresh_token, this.refreshCookieOptions());
    
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  async logout(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.['refresh_token'];
    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }
    res.clearCookie('access_token', this.authCookieOptions());
    res.clearCookie('refresh_token', this.authCookieOptions());
    return { success: true, message: 'Logged out successfully' };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getProfile(@CurrentUser() user: any) {
    return user;
  }
}
