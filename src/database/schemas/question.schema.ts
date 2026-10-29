import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { DifficultyLevel } from './exam.schema';

export type QuestionDocument = Question & Document;

export class QuestionOption {
  @Prop({ required: true })
  optionId: string; // e.g., 'opt_1', 'opt_2', 'opt_3', 'opt_4'

  @Prop({ required: true, trim: true })
  text: string;
}

@Schema({ timestamps: true, collection: 'questions' })
export class Question {
  @Prop({ required: true, trim: true })
  questionText: string;

  @Prop({
    type: [
      {
        optionId: { type: String, required: true },
        text: { type: String, required: true },
      },
    ],
    validate: [
      (val: QuestionOption[]) => val && val.length === 4,
      'Every question must have exactly 4 options',
    ],
  })
  options: QuestionOption[];

  @Prop({ required: true, select: false })
  correctOptionId: string;

  @Prop({ required: true, trim: true, index: true })
  topic: string;

  @Prop({ required: true, enum: DifficultyLevel, default: DifficultyLevel.INTERMEDIATE, index: true })
  difficulty: DifficultyLevel;

  @Prop({ required: true, default: 1, min: 0.1 })
  marks: number;

  @Prop({ required: true, default: false, index: true })
  isApproved: boolean;

  @Prop({ required: true, default: true, index: true })
  isActive: boolean;

  @Prop({ select: false })
  explanation?: string;

  @Prop({ type: Types.ObjectId, ref: 'Admin' })
  createdBy?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Admin' })
  approvedBy?: Types.ObjectId;
}

export const QuestionSchema = SchemaFactory.createForClass(Question);
QuestionSchema.index({ difficulty: 1, isApproved: 1, isActive: 1 });
QuestionSchema.index({ topic: 1, difficulty: 1 });

