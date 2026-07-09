import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AssistantResponsibility, Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  AssignAssistantGroupDto,
  AssignAssistantStudentsDto,
  CreateAcademicFollowUpDto,
  CreateGuardianContactDto,
  CreateTeachingSessionDto,
  UpdateAssignmentStatusDto,
  UpdateTeachingSessionStatusDto,
  UpsertAttendanceDto,
} from './dto/teaching.dto';
import { TeachingService } from './teaching.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.FINANCE_MANAGER, Role.ASSISTANT)
@Controller('teaching')
export class TeachingController {
  constructor(private readonly teaching: TeachingService) {}

  @Get('assistants')
  @Roles(Role.ADMIN, Role.FINANCE_MANAGER)
  listAssistants() {
    return this.teaching.listAssistants();
  }

  @Post('assistant-groups')
  @Roles(Role.ADMIN, Role.FINANCE_MANAGER)
  assignGroup(@Body() dto: AssignAssistantGroupDto, @CurrentUser() user: any) {
    return this.teaching.assignGroup(dto, user?.id);
  }

  @Get('assistant-groups')
  listGroupAssignments(
    @CurrentUser() user: any,
    @Query('assistantId') assistantId?: string,
    @Query('groupId') groupId?: string,
  ) {
    return this.teaching.listGroupAssignments(user, assistantId, groupId);
  }

  @Patch('assistant-groups/:id/status')
  @Roles(Role.ADMIN, Role.FINANCE_MANAGER)
  updateGroupAssignmentStatus(
    @Param('id') id: string,
    @Body() dto: UpdateAssignmentStatusDto,
    @CurrentUser() user: any,
  ) {
    return this.teaching.updateGroupAssignmentStatus(id, dto, user?.id);
  }

  @Post('assistant-students/bulk')
  @Roles(Role.ADMIN, Role.FINANCE_MANAGER)
  assignStudents(@Body() dto: AssignAssistantStudentsDto, @CurrentUser() user: any) {
    return this.teaching.assignStudents(dto, user?.id);
  }

  @Get('assistant-students')
  listStudentAssignments(
    @CurrentUser() user: any,
    @Query('assistantId') assistantId?: string,
    @Query('groupId') groupId?: string,
  ) {
    return this.teaching.listStudentAssignments(user, assistantId, groupId);
  }

  @Post('sessions')
  @Roles(Role.ADMIN, Role.FINANCE_MANAGER)
  createSession(@Body() dto: CreateTeachingSessionDto, @CurrentUser() user: any) {
    return this.teaching.createSession(dto, user?.id);
  }

  @Get('sessions')
  listSessions(
    @CurrentUser() user: any,
    @Query('groupId') groupId?: string,
    @Query('date') date?: string,
  ) {
    return this.teaching.listSessions(user, groupId, date);
  }

  @Get('sessions/:id')
  getSession(@Param('id') id: string, @CurrentUser() user: any) {
    return this.teaching.getSession(id, user);
  }

  @Patch('sessions/:id/status')
  @Roles(Role.ADMIN, Role.FINANCE_MANAGER)
  updateSessionStatus(
    @Param('id') id: string,
    @Body() dto: UpdateTeachingSessionStatusDto,
    @CurrentUser() user: any,
  ) {
    return this.teaching.updateSessionStatus(id, dto, user?.id);
  }

  @Post('sessions/:id/attendance')
  upsertAttendance(
    @Param('id') id: string,
    @Body() dto: UpsertAttendanceDto,
    @CurrentUser() user: any,
  ) {
    return this.teaching.upsertAttendance(id, dto, user);
  }

  @Get('sessions/:id/attendance')
  getAttendance(@Param('id') id: string, @CurrentUser() user: any) {
    return this.teaching.getAttendance(id, user);
  }

  @Get('sessions/:id/absences')
  getAbsences(@Param('id') id: string, @CurrentUser() user: any) {
    return this.teaching.getAbsences(id, user);
  }

  @Post('guardian-contacts')
  createGuardianContact(@Body() dto: CreateGuardianContactDto, @CurrentUser() user: any) {
    return this.teaching.createGuardianContact(dto, user);
  }

  @Post('academic-follow-ups')
  createAcademicFollowUp(@Body() dto: CreateAcademicFollowUpDto, @CurrentUser() user: any) {
    return this.teaching.createAcademicFollowUp(dto, user);
  }
}
