import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/audit')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Paginated audit log viewer with filters.
   * GET /admin/audit?page=1&limit=50&action=EXAM_START&suspicious=true
   */
  @Get()
  async getLogs(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('action') action?: string,
    @Query('userId') userId?: string,
    @Query('suspicious') suspicious?: string,
  ) {
    const take = Math.min(parseInt(limit || '50', 10), 200);
    const skip = (Math.max(parseInt(page || '1', 10), 1) - 1) * take;

    const where: any = {};
    if (action) where.action = action;
    if (userId) where.user_id = userId;
    if (suspicious === 'true') where.is_suspicious = true;

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { created_at: 'desc' },
        take,
        skip,
        include: {
          user: { select: { id: true, name: true, email: true, role: true } },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { data, total, page: Math.max(parseInt(page || '1', 10), 1), limit: take };
  }

  /**
   * Quick summary of suspicious activity count per action type.
   */
  @Get('suspicious-summary')
  async getSuspiciousSummary() {
    const logs = await this.prisma.auditLog.findMany({
      where: { is_suspicious: true },
      select: { action: true },
    });

    const counts: Record<string, number> = {};
    for (const log of logs) {
      counts[log.action] = (counts[log.action] || 0) + 1;
    }

    return counts;
  }
}
