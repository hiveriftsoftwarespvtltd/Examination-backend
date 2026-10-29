import {
  IsString,
  IsNotEmpty,
  IsArray,
  ValidateNested,
  ArrayMinSize,
  ArrayMaxSize,
  IsEnum,
  IsNumber,
  Min,
  IsOptional,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DifficultyLevel } from '../../../database/schemas/exam.schema';

export class OptionDto {
  @IsString()
  @IsNotEmpty()
  optionId: string;

  @IsString()
  @IsNotEmpty()
  text: string;
}

export class CreateQuestionDto {
  @IsString()
  @IsNotEmpty()
  questionText: string;

  @IsArray()
  @ArrayMinSize(4)
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => OptionDto)
  options: OptionDto[];

  @IsString()
  @IsNotEmpty()
  correctOptionId: string;

  @IsString()
  @IsNotEmpty()
  topic: string;

  @IsEnum(DifficultyLevel)
  difficulty: DifficultyLevel;

  @IsNumber()
  @Min(0.1)
  @IsOptional()
  marks?: number = 1;

  @IsOptional()
  @IsString()
  explanation?: string;

  @IsOptional()
  @IsBoolean()
  isApproved?: boolean = false;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;
}
