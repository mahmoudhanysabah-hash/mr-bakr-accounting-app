import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { requireEnvironment } from '../../common/env.validation';
import { AuthenticatedUser, JwtPayload, toAuthenticatedUser } from '../types/auth.types';
import { JWT_AUDIENCE, JWT_ISSUER } from '../services/auth-token.service';
import { Request } from 'express';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => {
          const cookieToken = request.cookies?.access_token;
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
      secretOrKey: requireEnvironment('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        email_verified: true,
      },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User inactive or not found');
    }

    return toAuthenticatedUser(user);
  }
}
