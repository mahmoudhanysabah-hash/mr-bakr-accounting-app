import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminUsersController } from '../users/admin-users.controller';
import { AuditController } from '../common/audit.controller';

@Module({
  imports: [PrismaModule],
  controllers: [
    AdminUsersController,
    AuditController
  ],
})
export class AdminModule {}
