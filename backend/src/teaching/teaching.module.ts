import { Module } from '@nestjs/common';
import { TeachingController } from './teaching.controller';
import { TeachingService } from './teaching.service';
import { LessonSheetService } from './lesson-sheet.service';
import { LessonReportService } from './lesson-report.service';
import { TodayLessonService } from './today-lesson.service';

@Module({
  controllers: [TeachingController],
  providers: [TeachingService, LessonSheetService, LessonReportService, TodayLessonService],
  exports: [TeachingService],
})
export class TeachingModule {}
