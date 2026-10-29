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
  Res,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { QuestionService } from './question.service';
import { CreateQuestionDto } from './dto/create-question.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { MustChangePasswordGuard } from '../../common/guards/must-change-password.guard';

@UseGuards(JwtAuthGuard, MustChangePasswordGuard)
@Controller('admin/questions')
export class QuestionController {
  constructor(private readonly questionService: QuestionService) {}

  @Post()
  async create(@Body() dto: CreateQuestionDto, @Req() req: any) {
    return this.questionService.create(dto, req.user.id);
  }

  @Get()
  async findAll(@Query() query: any) {
    return this.questionService.findAll(query);
  }

  @Get('export')
  async exportQuestions(@Query('format') format: 'csv' | 'xlsx' = 'csv', @Res() res: Response) {
    const file = await this.questionService.exportQuestions(format || 'csv');
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.send(file.buffer);
  }

  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  async importQuestions(
    @UploadedFile() file: any,
    @Query('dryRun') dryRun: string,
    @Req() req: any,
  ) {
    if (!file) {
      throw new BadRequestException('File is required for upload');
    }
    return this.questionService.importQuestions(
      file.buffer,
      file.originalname,
      dryRun === 'true',
      req.user.id,
    );
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.questionService.findOne(id);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: Partial<CreateQuestionDto>) {
    return this.questionService.update(id, dto);
  }

  @Patch(':id/approve')
  async toggleApproval(
    @Param('id') id: string,
    @Body('approve') approve: boolean,
    @Req() req: any,
  ) {
    return this.questionService.toggleApproval(id, req.user.id, approve !== false);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.questionService.remove(id);
  }
}

