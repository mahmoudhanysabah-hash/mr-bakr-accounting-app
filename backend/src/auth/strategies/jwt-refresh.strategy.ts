import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { requireEnvironment } from '../../common/env.validation';
import { toAuthenticatedUser } from '../types/auth.types';
import type { AuthenticatedUser, JwtPayload } from '../types/auth.types';
import { JWT_AUDIENCE, JWT_ISSUER } from '../services/auth-token.service';
import type { Request } from 'express';
import { createHash } from 'crypto';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => {
          const cookieToken = request.cookies?.refresh_token;
          if (typeof cookieToken === 'string' && cookieToken) return cookieToken;

          const authorization = request.headers.authorization;
          if (!authorization) return null;
          const [scheme, token] = authorization.split(' ');
          return scheme?.toLowerCase() === 'bearer' && token ? token : null;
        },
      ]),
      algorithms: ['HS256'],
      audience: JWT_AUDIENCE,
      ignoreExpiration: false,
      issuer: JWT_ISSUER,
      secretOrKey: requireEnvironment('JWT_REFRESH_SECRET'),
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtPayload): Promise<AuthenticatedUser> {
    const refreshToken = req.cookies?.refresh_token || this.readBearerToken(req);
    if (typeof refreshToken !== 'string' || !refreshToken) {
      throw new UnauthorizedException('Refresh token missing');
    }

    const session = await this.prisma.session.findUnique({
      where: { refresh_token: createHash('sha256').update(refreshToken).digest('hex') },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            status: true,
            email_verified: true,
          },
        },
      },
    });

    if (!session || session.user_id !== payload.sub || session.expires_at < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (session.user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User is inactive');
    }

    return toAuthenticatedUser(session.user);
  }

  private readBearerToken(req: Request): string | undefined {
    const authorization = req.headers.authorization;
    if (!authorization) return undefined;
    const [scheme, token] = authorization.split(' ');
    return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
  }
}
