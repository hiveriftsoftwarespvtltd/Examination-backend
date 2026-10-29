import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Admin, AdminSchema } from './schemas/admin.schema';
import { Exam, ExamSchema } from './schemas/exam.schema';
import { Question, QuestionSchema } from './schemas/question.schema';
import { Candidate, CandidateSchema } from './schemas/candidate.schema';
import { ExamAttempt, ExamAttemptSchema } from './schemas/attempt.schema';
import { Result, ResultSchema } from './schemas/result.schema';
import { AuditLog, AuditLogSchema } from './schemas/audit-log.schema';
import { SeederService } from './seeder.service';

@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('database.uri'),
        writeConcern: { w: 'majority', j: true },
        readPreference: 'primary',
      }),
    }),
    MongooseModule.forFeature([
      { name: Admin.name, schema: AdminSchema },
      { name: Exam.name, schema: ExamSchema },
      { name: Question.name, schema: QuestionSchema },
      { name: Candidate.name, schema: CandidateSchema },
      { name: ExamAttempt.name, schema: ExamAttemptSchema },
      { name: Result.name, schema: ResultSchema },
      { name: AuditLog.name, schema: AuditLogSchema },
    ]),
  ],
  providers: [SeederService],
  exports: [MongooseModule, SeederService],
})
export class DatabaseModule {}

