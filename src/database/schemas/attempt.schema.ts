import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AttemptDocument = ExamAttempt & Document;

export enum AttemptStatus {
  CREATED = 'CREATED',
  IN_PROGRESS = 'IN_PROGRESS',
  FINALIZING = 'FINALIZING',
  COMPLETED = 'COMPLETED',
}

export class AssignedOption {
  @Prop({ required: true })
  optionId: string;

  @Prop({ required: true })
  text: string;
}

export class AssignedQuestion {
  @Prop({ required: true })
  questionId: string;

  @Prop({ required: true })
  questionText: string;

  @Prop({ required: true })
  topic: string;

  @Prop({ required: true })
  marks: number;

  @Prop({ type: [AssignedOption], required: true })
  options: AssignedOption[];
}

export class PrivateAnswerKeyItem {
  @Prop({ required: true })
  questionId: string;

  @Prop({ required: true })
  correctOptionId: string;

  @Prop({ required: true })
  marks: number;
}

export class SavedResponse {
  @Prop({ required: true })
  questionId: string;

  @Prop({ default: null })
  selectedOptionId: string | null;

  @Prop({ default: 1 })
  revision: number;

  @Prop({ default: Date.now })
  updatedAt: Date;
}

export class ExamSnapshot {
  @Prop({ required: true })
  questionCount: number;

  @Prop({ required: true })
  durationMinutes: number;

  @Prop({ required: true })
  passingPercentage: number;

  @Prop({ required: true })
  marksPerQuestion: number;

  @Prop({ required: true })
  negativeMarking: boolean;

  @Prop({ required: true })
  negativeMarksPerQuestion: number;
}

@Schema({ timestamps: true, collection: 'exam_attempts' })
export class ExamAttempt {
  @Prop({ type: Types.ObjectId, ref: 'Candidate', required: true, index: true })
  candidateId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Exam', required: true, index: true })
  examId: Types.ObjectId;

  @Prop({ required: true, default: 1 })
  attemptNumber: number;

  @Prop({ required: true, enum: AttemptStatus, default: AttemptStatus.CREATED, index: true })
  status: AttemptStatus;

  @Prop({ type: ExamSnapshot, required: true })
  examSnapshot: ExamSnapshot;

  @Prop({ type: [AssignedQuestion], default: [] })
  assignedQuestions: AssignedQuestion[];

  @Prop({ type: [PrivateAnswerKeyItem], select: false, default: [] })
  privateAnswerKey: PrivateAnswerKeyItem[];

  @Prop({ type: [SavedResponse], default: [] })
  savedResponses: SavedResponse[];

  @Prop()
  startedAt?: Date;

  @Prop({ index: true })
  deadline?: Date;

  @Prop()
  submittedAt?: Date;

  @Prop({ default: 0 })
  timeTakenSeconds?: number;

  @Prop({ default: 0 })
  finalizationFencingToken: number;

  @Prop()
  workerLockId?: string;

  @Prop({ index: true })
  leaseExpiresAt?: Date;

  @Prop()
  finalizingStartedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'Result' })
  resultId?: Types.ObjectId;
}

export const ExamAttemptSchema = SchemaFactory.createForClass(ExamAttempt);

// Strict compound unique index for candidate, exam, and attempt number
ExamAttemptSchema.index({ candidateId: 1, examId: 1, attemptNumber: 1 }, { unique: true });

// Background recovery index
ExamAttemptSchema.index({ status: 1, deadline: 1 });
ExamAttemptSchema.index({ status: 1, leaseExpiresAt: 1 });

