import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { createHash } from 'crypto';
import { Request } from 'express';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(private prisma: PrismaService) {
    if (!process.env.JWT_REFRESH_SECRET) {
      throw new Error('FATAL: JWT_REFRESH_SECRET environment variable is missing.');
    }
    
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => {
          let token = null;
          if (request && request.cookies) {
            token = request.cookies['refresh_token'];
          }
          if (!token && request.headers.authorization) {
            token = request.headers.authorization.replace('Bearer ', '').trim();
          }
          return token;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_REFRESH_SECRET,
      passReqToCallback: true,
    });
  }

  async validate(req: any, payload: any) {
    const refreshToken = req.cookies?.['refresh_token'] || req.headers.authorization?.replace('Bearer ', '').trim();
    if (!refreshToken) throw new UnauthorizedException('Refresh token missing');
    const refreshTokenHash = createHash('sha256').update(refreshToken).digest('hex');

    const session = await this.prisma.session.findUnique({
      where: { refresh_token: refreshTokenHash },
      include: { user: true },
    });

    if (!session || session.expires_at < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (session.user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User is inactive');
    }

    return session.user;
  }
}
