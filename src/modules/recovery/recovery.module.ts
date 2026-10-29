import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '@nestjs/config';
import { RecoveryService } from './recovery.service';
import { EvaluationModule } from '../evaluation/evaluation.module';

@Module({
  imports: [ScheduleModule.forRoot(), ConfigModule, EvaluationModule],
  providers: [RecoveryService],
  exports: [RecoveryService],
})
export class RecoveryModule {}

