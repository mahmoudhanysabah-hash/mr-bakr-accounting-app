import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AdminUsersController } from '../users/admin-users.controller';
import { AdminUsersService } from '../users/admin-users.service';
import { AuditController } from '../common/audit.controller';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [AdminUsersController, AuditController],
  providers: [AdminUsersService],
})
export class AdminModule {}
