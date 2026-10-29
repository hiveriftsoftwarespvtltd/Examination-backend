import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { ExamModule } from './modules/exam/exam.module';
import { QuestionModule } from './modules/question/question.module';
import { CandidateModule } from './modules/candidate/candidate.module';
import { AttemptModule } from './modules/attempt/attempt.module';
import { EvaluationModule } from './modules/evaluation/evaluation.module';
import { RecoveryModule } from './modules/recovery/recovery.module';
import { ResultModule } from './modules/result/result.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    DatabaseModule,
    AuthModule,
    ExamModule,
    QuestionModule,
    CandidateModule,
    AttemptModule,
    EvaluationModule,
    RecoveryModule,
    ResultModule,
  ],
})
export class AppModule {}

