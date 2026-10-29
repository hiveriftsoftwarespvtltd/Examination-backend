import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ResultDocument = Result & Document;

@Schema({ timestamps: true, collection: 'results' })
export class Result {
  @Prop({ type: Types.ObjectId, ref: 'ExamAttempt', required: true, unique: true, index: true })
  attemptId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Candidate', required: true, index: true })
  candidateId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Exam', required: true, index: true })
  examId: Types.ObjectId;

  @Prop({ required: true })
  totalQuestions: number;

  @Prop({ required: true })
  correctAnswers: number;

  @Prop({ required: true })
  incorrectAnswers: number;

  @Prop({ required: true })
  unansweredQuestions: number;

  @Prop({ required: true })
  totalPossibleMarks: number;

  @Prop({ required: true })
  marksObtained: number;

  @Prop({ required: true })
  percentage: number;

  @Prop({ required: true })
  passingPercentage: number;

  @Prop({ required: true, index: true })
  isPassed: boolean;

  @Prop({ default: Date.now })
  calculatedAt: Date;
}

export const ResultSchema = SchemaFactory.createForClass(Result);
ResultSchema.index({ examId: 1, isPassed: 1 });
