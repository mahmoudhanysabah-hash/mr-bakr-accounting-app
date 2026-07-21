import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Roles(Role.ADMIN)
  @Get()
  getAllUsers() {
    return this.usersService.findAll();
  }

  @Get('profile')
  getMyProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.findOne(user.id);
  }

  @Put('profile')
  updateMyProfile(@CurrentUser() user: AuthenticatedUser, @Body() data: UpdateProfileDto) {
    return this.usersService.updateProfile(user.id, data);
  }

  @Roles(Role.ADMIN)
  @Get(':id')
  getUserById(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }
}
