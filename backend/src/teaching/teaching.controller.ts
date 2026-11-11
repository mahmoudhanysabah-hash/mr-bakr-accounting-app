import { Body, Controller, Get, Header, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
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
  StudentAcademicReportQueryDto,
  GroupAcademicReportQueryDto,
} from './dto/teaching.dto';
import { RemoveTeachingEnrollmentDto, SaveLessonSheetDto } from './dto/lesson-sheet.dto';
import { TeachingService } from './teaching.service';
import { LessonSheetService } from './lesson-sheet.service';
import { LessonReportService } from './lesson-report.service';
import type { TeachingActor } from './lesson-roster';
import { TodayLessonService } from './today-lesson.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.FINANCE_MANAGER, Role.ASSISTANT)
@Controller('teaching')
export class TeachingController {
  constructor(
    private readonly teaching: TeachingService,
    private readonly sheets: LessonSheetService,
    private readonly reports: LessonReportService,
    private readonly todayLessons: TodayLessonService,
  ) {}

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

  @Get('reports/operations')
  getOperationsReport(
    @CurrentUser() user: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('groupId') groupId?: string,
    @Query('assistantId') assistantId?: string,
  ) {
    return this.teaching.getOperationsReport(user, startDate, endDate, groupId, assistantId);
  }

  @Get('reports/student-academic')
  getStudentAcademicReport(
    @CurrentUser() user: any,
    @Query() query: StudentAcademicReportQueryDto,
  ) {
    return this.reports.studentReport(user, query);
  }

  @Get('reports/group-academic')
  getGroupAcademicReport(@CurrentUser() user: TeachingActor, @Query() query: GroupAcademicReportQueryDto) {
    return this.reports.groupReport(user, query);
  }

  @Get('sessions/:id/sheet')
  getSheet(@Param('id') id: string, @CurrentUser() user: TeachingActor) {
    return this.sheets.getSheet(id, user);
  }

  @Post('sessions/:id/sheet')
  saveSheet(@Param('id') id: string, @Body() dto: SaveLessonSheetDto, @CurrentUser() user: TeachingActor) {
    return this.sheets.saveSheet(id, dto, user);
  }

  @Get('sessions/:id/sheet-export')
  getShareableSheet(@Param('id') id: string, @CurrentUser() user: TeachingActor) {
    return this.sheets.getShareableSheet(id, user);
  }

  @Get('groups/:id/lesson-roster')
  @Roles(Role.ADMIN, Role.FINANCE_MANAGER)
  manageLessonRoster(@Param('id') id: string, @CurrentUser() user: TeachingActor) {
    return this.sheets.manageRoster(id, user);
  }

  @Patch('lesson-roster/:id')
  @Roles(Role.ADMIN, Role.FINANCE_MANAGER)
  removeTeachingEnrollment(@Param('id') id: string, @Body() dto: RemoveTeachingEnrollmentDto, @CurrentUser() user: TeachingActor) {
    return this.sheets.removeEnrollment(id, dto, user);
  }

  @Get('lesson-roster/:id/history')
  @Roles(Role.ADMIN, Role.FINANCE_MANAGER)
  getTeachingHistory(@Param('id') id: string, @CurrentUser() user: TeachingActor) {
    return this.sheets.getHistory(id, user);
  }

  @Post('sessions')
  createSession(@Body() dto: CreateTeachingSessionDto, @CurrentUser() user: any) {
    return this.teaching.createSession(dto, user);
  }

  @Get('schedule/today')
  @Header('Cache-Control', 'private, no-store')
  getTodaySchedule(@CurrentUser() user: TeachingActor) {
    return this.todayLessons.getToday(user);
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
