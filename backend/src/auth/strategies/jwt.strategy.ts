import { Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { requireEnvironment } from '../../common/env.validation';
import { toAuthenticatedUser } from '../types/auth.types';
import type { AuthenticatedUser, JwtPayload } from '../types/auth.types';
import { JWT_AUDIENCE, JWT_ISSUER } from '../services/auth-token.service';
import type { Request } from 'express';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: (request: Request) => {
        const cookieToken = request.cookies?.access_token;
        return typeof cookieToken === 'string' && cookieToken ? cookieToken : null;
      },
      algorithms: ['HS256'],
      audience: JWT_AUDIENCE,
      ignoreExpiration: false,
      issuer: JWT_ISSUER,
      secretOrKey: requireEnvironment('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (!payload.sid) {
      throw new UnauthorizedException('Session missing from access token');
    }

    const session = await this.prisma.session.findUnique({
      where: { id: payload.sid },
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

    if (
      !session ||
      session.user_id !== payload.sub ||
      session.expires_at < new Date() ||
      session.user.status !== 'ACTIVE'
    ) {
      throw new UnauthorizedException('Session inactive or not found');
    }

    return toAuthenticatedUser(session.user);
  }
}
