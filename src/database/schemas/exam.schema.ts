import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ExamDocument = Exam & Document;

export enum DifficultyLevel {
  BEGINNER = 'Beginner',
  INTERMEDIATE = 'Intermediate',
  ADVANCED = 'Advanced',
  EXPERT = 'Expert',
  VERY_HARD = 'Very Hard',
}

@Schema({ timestamps: true, collection: 'exams' })
export class Exam {
  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true, index: true })
  slug: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ required: true, enum: DifficultyLevel, default: DifficultyLevel.INTERMEDIATE, index: true })
  difficulty: DifficultyLevel;

  @Prop({ required: true, default: 100, min: 1 })
  questionCount: number;

  @Prop({ required: true, default: 100, min: 1 })
  durationMinutes: number;

  @Prop({ required: true, default: 50, min: 0, max: 100 })
  passingPercentage: number;

  @Prop({ required: true, default: 1, min: 0.1 })
  marksPerQuestion: number;

  @Prop({ required: true, default: false })
  negativeMarking: boolean;

  @Prop({ required: true, default: 0, min: 0 })
  negativeMarksPerQuestion: number;

  @Prop({ required: true, default: false })
  allowRetakes: boolean;

  @Prop({ required: true, default: 1, min: 1 })
  maxAttempts: number;

  @Prop({ required: true, default: false, index: true })
  isPublished: boolean;

  @Prop({ required: true, default: true, index: true })
  isActive: boolean;

  @Prop({ required: true, default: false, index: true })
  isLocked: boolean;

  @Prop({ default: null })
  lockedReason?: string;

  @Prop({ default: null })
  lastLockedAt?: Date;

  @Prop({ default: null })
  lastRestartedAt?: Date;

  @Prop({ default: 'Read each question carefully before selecting an answer.' })
  instructions: string;

  @Prop({ type: Types.ObjectId, ref: 'Admin' })
  createdBy?: Types.ObjectId;
}

export const ExamSchema = SchemaFactory.createForClass(Exam);
ExamSchema.index({ isPublished: 1, isActive: 1 });

