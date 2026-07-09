import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export abstract class BaseService<T> {
  protected constructor(
    protected readonly prisma: PrismaService,
    protected readonly modelName: string
  ) {}

  async findAll(params?: any): Promise<T[]> {
    return (this.prisma as any)[this.modelName].findMany(params);
  }

  async findOne(id: string): Promise<T> {
    const record = await (this.prisma as any)[this.modelName].findUnique({ where: { id } });
    if (!record) throw new NotFoundException(`${this.modelName} with id ${id} not found`);
    return record;
  }

  async create(data: any): Promise<T> {
    return (this.prisma as any)[this.modelName].create({ data });
  }

  async update(id: string, data: any): Promise<T> {
    const record = await (this.prisma as any)[this.modelName].update({ where: { id }, data }).catch(() => null);
    if (!record) throw new NotFoundException(`${this.modelName} with id ${id} not found`);
    return record;
  }

  async delete(id: string): Promise<T> {
    const record = await (this.prisma as any)[this.modelName].delete({ where: { id } }).catch(() => null);
    if (!record) throw new NotFoundException(`${this.modelName} with id ${id} not found`);
    return record;
  }
}
