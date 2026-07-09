import { Module } from '@nestjs/common';
import { TeachingController } from './teaching.controller';
import { TeachingService } from './teaching.service';

@Module({
  controllers: [TeachingController],
  providers: [TeachingService],
  exports: [TeachingService],
})
export class TeachingModule {}
