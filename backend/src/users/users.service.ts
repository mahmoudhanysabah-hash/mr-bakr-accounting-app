import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        created_at: true,
      },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        email_verified: true,
        created_at: true,
        updated_at: true,
        profile: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  updateProfile(userId: string, data: UpdateProfileDto) {
    return this.prisma.profile.upsert({
      where: { user_id: userId },
      update: data,
      create: {
        user_id: userId,
        ...data,
      },
    });
  }
}
