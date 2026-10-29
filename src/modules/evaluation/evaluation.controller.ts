import {
  Controller,
  Post,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { EvaluationService } from './evaluation.service';
import { AttemptAuthGuard } from '../../common/guards/attempt-auth.guard';

@UseGuards(AttemptAuthGuard)
@Controller('candidate/attempts')
export class EvaluationController {
  constructor(private readonly evaluationService: EvaluationService) {}

  @Post(':attemptId/submit')
  @HttpCode(HttpStatus.OK)
  async submitExam(@Param('attemptId') attemptId: string) {
    return this.evaluationService.submitCandidateExam(attemptId);
  }
}

