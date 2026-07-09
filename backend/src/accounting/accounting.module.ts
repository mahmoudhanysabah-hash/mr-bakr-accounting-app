import { Module } from '@nestjs/common';
import { AccountingController } from './accounting.controller';
import { AccountingService } from './accounting.service';
import { ScreenshotImportService } from './screenshot-import.service';

@Module({
  controllers: [AccountingController],
  providers: [AccountingService, ScreenshotImportService],
  exports: [AccountingService, ScreenshotImportService],
})
export class AccountingModule {}
