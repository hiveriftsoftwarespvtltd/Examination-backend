import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsNumber,
  Min,
  Max,
  IsBoolean,
  IsOptional,
} from 'class-validator';
import { DifficultyLevel } from '../../../database/schemas/exam.schema';

export class CreateExamDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  slug: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(DifficultyLevel)
  difficulty: DifficultyLevel;

  @IsNumber()
  @Min(1)
  @IsOptional()
  questionCount?: number = 100;

  @IsNumber()
  @Min(1)
  @IsOptional()
  durationMinutes?: number = 100;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  passingPercentage?: number = 50;

  @IsNumber()
  @Min(0.1)
  @IsOptional()
  marksPerQuestion?: number = 1;

  @IsBoolean()
  @IsOptional()
  negativeMarking?: boolean = false;

  @IsNumber()
  @Min(0)
  @IsOptional()
  negativeMarksPerQuestion?: number = 0;

  @IsBoolean()
  @IsOptional()
  allowRetakes?: boolean = false;

  @IsNumber()
  @Min(1)
  @IsOptional()
  maxAttempts?: number = 1;

  @IsBoolean()
  @IsOptional()
  isPublished?: boolean = false;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean = true;

  @IsString()
  @IsOptional()
  instructions?: string;
}
