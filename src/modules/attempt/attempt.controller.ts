import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AttemptService } from './attempt.service';
import { SaveResponseDto } from './dto/save-response.dto';
import { AttemptAuthGuard } from '../../common/guards/attempt-auth.guard';

@UseGuards(AttemptAuthGuard)
@Controller('candidate/attempts')
export class AttemptController {
  constructor(private readonly attemptService: AttemptService) {}

  @Post(':attemptId/start')
  @HttpCode(HttpStatus.OK)
  async startExam(@Param('attemptId') attemptId: string) {
    return this.attemptService.startExam(attemptId);
  }

  @Get(':attemptId/state')
  async getAttemptState(@Param('attemptId') attemptId: string) {
    return this.attemptService.getAttemptState(attemptId);
  }

  @Post(':attemptId/save-response')
  @HttpCode(HttpStatus.OK)
  async saveResponse(
    @Param('attemptId') attemptId: string,
    @Body() dto: SaveResponseDto,
  ) {
    return this.attemptService.saveResponse(attemptId, dto);
  }
}

