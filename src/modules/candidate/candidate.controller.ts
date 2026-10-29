import { Controller, Post, Body, Param } from '@nestjs/common';
import { CandidateService } from './candidate.service';
import { RegisterCandidateDto } from './dto/register-candidate.dto';

@Controller('candidate')
export class CandidateController {
  constructor(private readonly candidateService: CandidateService) {}

  @Post('exams/:slug/register')
  async register(
    @Param('slug') slug: string,
    @Body() dto: RegisterCandidateDto,
  ) {
    return this.candidateService.registerCandidate(slug, dto);
  }
}

