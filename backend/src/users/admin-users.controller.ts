import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { CreateStaffUserDto, UpdateStaffUserDto } from './dto/staff-user.dto';
import { AdminUsersService } from './admin-users.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Get()
  listUsers() {
    return this.adminUsersService.listUsers();
  }

  @Post()
  createUser(@Body() dto: CreateStaffUserDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.adminUsersService.createUser(dto, actor);
  }

  @Patch(':id')
  updateUser(
    @Param('id') id: string,
    @Body() dto: UpdateStaffUserDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.adminUsersService.updateUser(id, dto, actor);
  }
}
