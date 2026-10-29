import { IsString, IsNotEmpty, IsOptional, IsNumber, Min } from 'class-validator';

export class SaveResponseDto {
  @IsString()
  @IsNotEmpty()
  questionId: string;

  @IsOptional()
  @IsString()
  selectedOptionId: string | null;

  @IsNumber()
  @Min(1)
  expectedRevision: number;
}

