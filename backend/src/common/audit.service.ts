import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(data: {
    userId?: string;
    action: string;
    entity?: string;
    entityId?: string;
    payload?: any;
    isSuspicious?: boolean;
  }) {
    try {
      await this.prisma.auditLog.create({
        data: {
          user_id: data.userId,
          action: data.action,
          entity: data.entity,
          entity_id: data.entityId,
          payload_json: data.payload ? JSON.stringify(data.payload) : null,
          is_suspicious: data.isSuspicious ?? false,
        },
      });
    } catch (e) {
      console.error('Failed to write audit log', e);
    }
  }
}
