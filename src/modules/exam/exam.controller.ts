import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ExamService } from './exam.service';
import { CreateExamDto } from './dto/create-exam.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { MustChangePasswordGuard } from '../../common/guards/must-change-password.guard';

@Controller()
export class ExamController {
  constructor(private readonly examService: ExamService) {}

  // Public candidate-facing exam metadata (Zero answers or admin leakage)
  @Get('candidate/active-exam')
  async getActiveExam() {
    return this.examService.findActiveDefaultExam();
  }

  @Get('candidate/exams/:slug')
  async getPublicExamBySlug(@Param('slug') slug: string) {
    return this.examService.findBySlugPublic(slug);
  }

  // Admin-only exam management endpoints
  @UseGuards(JwtAuthGuard, MustChangePasswordGuard)
  @Post('admin/exams')
  async create(@Body() dto: CreateExamDto, @Req() req: any) {
    return this.examService.create(dto, req.user.id);
  }

  @UseGuards(JwtAuthGuard, MustChangePasswordGuard)
  @Get('admin/exams')
  async findAll(@Query() query: any) {
    return this.examService.findAll(query);
  }

  @UseGuards(JwtAuthGuard, MustChangePasswordGuard)
  @Get('admin/exams/:id')
  async findOne(@Param('id') id: string) {
    return this.examService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, MustChangePasswordGuard)
  @Put('admin/exams/:id')
  async update(@Param('id') id: string, @Body() dto: Partial<CreateExamDto>) {
    return this.examService.update(id, dto);
  }

  @UseGuards(JwtAuthGuard, MustChangePasswordGuard)
  @Patch('admin/exams/:id/publish')
  async togglePublish(@Param('id') id: string, @Body('publish') publish: boolean) {
    return this.examService.togglePublish(id, publish !== false);
  }

  @UseGuards(JwtAuthGuard, MustChangePasswordGuard)
  @Patch('admin/exams/:id/restart')
  async restartExam(@Param('id') id: string) {
    return this.examService.restartExam(id);
  }

  @UseGuards(JwtAuthGuard, MustChangePasswordGuard)
  @Delete('admin/exams/:id')
  async remove(@Param('id') id: string) {
    return this.examService.remove(id);
  }
}

