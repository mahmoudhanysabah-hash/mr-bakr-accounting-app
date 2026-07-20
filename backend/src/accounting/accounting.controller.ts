import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  ParseFilePipeBuilder,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ManagedStudentStatus, Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AccountingService } from './accounting.service';
import { ScreenshotImportService } from './screenshot-import.service';
import {
  CreateAccountingGroupDto,
  CreateAccountingPaymentDto,
  CreateChargeFromEnrollmentDto,
  CreateCompanyExpenseDto,
  CreateManagedStudentDto,
  CreateStudentDiscountDto,
  CreateStudentRefundDto,
  EndEnrollmentDto,
  EnrollStudentDto,
  GenerateAlertsDto,
  OpenBillingPeriodDto,
  TransferStudentDto,
  UpdateAccountingGroupDto,
  UpdateAccountingPaymentDto,
  UpdateAlertStatusDto,
  UpdateManagedStudentDto,
  BulkEnrollStudentsDto,
} from './dto/accounting.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.ACCOUNTANT, Role.FINANCE_MANAGER)
@Controller('accounting')
export class AccountingController {
  constructor(
    private readonly accounting: AccountingService,
    private readonly screenshotImport: ScreenshotImportService,
  ) {}

  @Post('imports/screenshot/confirm')
  @Roles(Role.ADMIN, Role.FINANCE_MANAGER)
  confirmScreenshotImport(@Body() body: any, @CurrentUser() user: any) {
    return this.screenshotImport.importRows(body, user?.id);
  }

  @Post('imports/screenshot/analyze')
  @Roles(Role.ADMIN, Role.FINANCE_MANAGER)
  @UseInterceptors(FileInterceptor('file'))
  analyzeScreenshotImport(
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({ fileType: '.(png|jpeg|jpg)' })
        .addMaxSizeValidator({ maxSize: 10 * 1024 * 1024 })
        .build({
          errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        }),
    ) file: Express.Multer.File,
    @Body() body: any,
  ) {
    return this.screenshotImport.analyzeImage(file, body);
  }

  @Post('students')
  createStudent(@Body() dto: CreateManagedStudentDto, @CurrentUser() user: any) {
    return this.accounting.createStudent(dto, user?.id);
  }

  @Get('students')
  listStudents(
    @Query('q') q?: string,
    @Query('status') status?: ManagedStudentStatus,
    @Query('groupId') groupId?: string,
  ) {
    return this.accounting.listStudents(q, status, groupId);
  }

  @Get('students/:id')
  getStudent(@Param('id') id: string) {
    return this.accounting.getStudent(id);
  }

  @Patch('students/:id')
  updateStudent(
    @Param('id') id: string,
    @Body() dto: UpdateManagedStudentDto,
    @CurrentUser() user: any,
  ) {
    return this.accounting.updateStudent(id, dto, user?.id);
  }

  @Post('groups')
  @Roles(Role.ADMIN, Role.FINANCE_MANAGER)
  createGroup(@Body() dto: CreateAccountingGroupDto, @CurrentUser() user: any) {
    return this.accounting.createGroup(dto, user?.id);
  }

  @Get('groups')
  listGroups(@Query('active') active?: string) {
    return this.accounting.listGroups(active === undefined ? undefined : active === 'true');
  }

  @Patch('groups/:id')
  @Roles(Role.ADMIN, Role.FINANCE_MANAGER)
  updateGroup(
    @Param('id') id: string,
    @Body() dto: UpdateAccountingGroupDto,
    @CurrentUser() user: any,
  ) {
    return this.accounting.updateGroup(id, dto, user?.id);
  }

  @Delete('groups/:id')
  @Roles(Role.ADMIN, Role.FINANCE_MANAGER)
  deleteGroup(@Param('id') id: string, @CurrentUser() user: any) {
    return this.accounting.deleteGroup(id, user?.id);
  }

  @Post('enrollments')
  enrollStudent(@Body() dto: EnrollStudentDto, @CurrentUser() user: any) {
    return this.accounting.enrollStudent(dto, user?.id);
  }

  @Post('enrollments/bulk')
  enrollStudentsBulk(@Body() dto: BulkEnrollStudentsDto, @CurrentUser() user: any) {
    return this.accounting.enrollStudentsBulk(dto, user?.id);
  }

  @Post('enrollments/transfer')
  transferStudent(@Body() dto: TransferStudentDto, @CurrentUser() user: any) {
    return this.accounting.transferStudent(dto, user?.id);
  }

  @Post('enrollments/:id/end')
  endEnrollment(
    @Param('id') id: string,
    @Body() dto: EndEnrollmentDto,
    @CurrentUser() user: any,
  ) {
    return this.accounting.endEnrollment(id, dto, user?.id);
  }

  @Post('periods/open')
  @Roles(Role.ADMIN, Role.FINANCE_MANAGER)
  openBillingPeriod(@Body() dto: OpenBillingPeriodDto, @CurrentUser() user: any) {
    return this.accounting.openBillingPeriod(dto, user?.id);
  }

  @Get('periods')
  listBillingPeriods() {
    return this.accounting.listBillingPeriods();
  }

  @Get('periods/:id')
  getBillingPeriod(@Param('id') id: string) {
    return this.accounting.getBillingPeriod(id);
  }

  @Post('periods/:id/close')
  @Roles(Role.ADMIN, Role.FINANCE_MANAGER)
  closeBillingPeriod(@Param('id') id: string, @CurrentUser() user: any) {
    return this.accounting.closeBillingPeriod(id, user?.id);
  }

  @Post('charges/from-enrollment')
  @Roles(Role.ADMIN, Role.FINANCE_MANAGER)
  createChargeFromEnrollment(
    @Body() dto: CreateChargeFromEnrollmentDto,
    @CurrentUser() user: any,
  ) {
    return this.accounting.createChargeFromEnrollment(dto, user?.id);
  }

  @Post('payments')
  recordPayment(@Body() dto: CreateAccountingPaymentDto, @CurrentUser() user: any) {
    return this.accounting.recordPayment(dto, user?.id);
  }

  @Post('payments/:id/receipt')
  @UseInterceptors(FileInterceptor('file'))
  uploadReceipt(
    @Param('id') id: string,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({ fileType: '.(png|jpeg|jpg|pdf)' })
        .addMaxSizeValidator({ maxSize: 5 * 1024 * 1024 }) // 5MB Limit
        .build({
          errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY
        }),
    ) file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    return this.accounting.uploadReceipt(id, file, user?.id);
  }

  @Get('payments/:id')
  getPayment(@Param('id') id: string) {
    return this.accounting.getPayment(id);
  }

  @Patch('payments/:id')
  @Roles(Role.ADMIN, Role.FINANCE_MANAGER)
  updatePayment(
    @Param('id') id: string,
    @Body() dto: UpdateAccountingPaymentDto,
    @CurrentUser() user: any,
  ) {
    return this.accounting.updatePayment(id, dto, user?.id);
  }

  @Delete('payments/:id')
  @Roles(Role.ADMIN, Role.FINANCE_MANAGER)
  deletePayment(@Param('id') id: string, @CurrentUser() user: any) {
    return this.accounting.deletePayment(id, user?.id);
  }

  @Delete('receipts/:key')
  @Roles(Role.ADMIN, Role.FINANCE_MANAGER)
  deleteReceipt(@Param('key') key: string, @CurrentUser() user: any) {
    return this.accounting.deleteReceipt(key, user?.id);
  }

  @Post('discounts')
  @Roles(Role.ADMIN, Role.FINANCE_MANAGER)
  grantDiscount(@Body() dto: CreateStudentDiscountDto, @CurrentUser() user: any) {
    return this.accounting.grantDiscount(dto, user?.id);
  }

  @Post('refunds')
  @Roles(Role.ADMIN, Role.FINANCE_MANAGER)
  recordRefund(@Body() dto: CreateStudentRefundDto, @CurrentUser() user: any) {
    return this.accounting.recordRefund(dto, user?.id);
  }

  @Get('receipts/:key')
  async getReceiptFile(@Param('key') key: string, @Res() res: Response) {
    const file = await this.accounting.getReceiptFile(key);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${file.originalName}"`);
    res.send(file.buffer);
  }

  // --- Expenses ---
  @Post('expenses')
  recordExpense(@Body() dto: CreateCompanyExpenseDto, @CurrentUser() user: any) {
    return this.accounting.recordExpense(dto, user?.id);
  }

  @Get('expenses')
  listExpenses(
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    return this.accounting.listExpenses(month ? Number(month) : undefined, year ? Number(year) : undefined);
  }

  @Post('expenses/:id/receipt')
  @UseInterceptors(FileInterceptor('file'))
  uploadExpenseReceipt(
    @Param('id') id: string,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({ fileType: '.(png|jpeg|jpg|pdf)' })
        .addMaxSizeValidator({ maxSize: 5 * 1024 * 1024 }) // 5MB Limit
        .build({
          errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY
        }),
    ) file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    return this.accounting.uploadExpenseReceipt(id, file, user?.id);
  }

  @Get('expenses/receipts/:key')
  async getExpenseReceiptFile(@Param('key') key: string, @Res() res: Response) {
    const file = await this.accounting.getExpenseReceiptFile(key);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${file.originalName}"`);
    res.send(file.buffer);
  }

  // --- Alerts ---
  @Post('alerts/generate')
  generateAlerts(@Body() dto: GenerateAlertsDto, @CurrentUser() user: any) {
    return this.accounting.generateCollectionAlerts(dto, user?.id);
  }

  @Get('alerts')
  listAlerts(@Query('periodId') periodId?: string) {
    return this.accounting.listAlerts(periodId);
  }

  @Patch('alerts/:id')
  updateAlertStatus(
    @Param('id') id: string,
    @Body() dto: UpdateAlertStatusDto,
    @CurrentUser() user: any,
  ) {
    return this.accounting.updateAlertStatus(id, dto, user?.id);
  }

  @Get('dashboard-stats')
  getDashboardStats() {
    return this.accounting.getDashboardStats();
  }

  @Get('reports/summary')
  getReportsSummary(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.accounting.getReportsSummary(startDate, endDate);
  }

  @Get('reports/arrears')
  getArrearsReport(
    @Query('periodId') periodId?: string,
    @Query('groupId') groupId?: string,
  ) {
    return this.accounting.getArrearsReport(periodId, groupId);
  }
}
