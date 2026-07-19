import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { requireEnvironment } from '../common/env.validation';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { AuthTokenService, JWT_AUDIENCE, JWT_ISSUER } from './services/auth-token.service';
import { PasswordService } from './services/password.service';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: requireEnvironment('JWT_SECRET'),
      signOptions: {
        algorithm: 'HS256',
        audience: JWT_AUDIENCE,
        expiresIn: '15m',
        issuer: JWT_ISSUER,
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthTokenService,
    PasswordService,
    JwtStrategy,
    JwtRefreshStrategy,
  ],
  exports: [AuthService, AuthTokenService, PasswordService],
})
export class AuthModule {}
