import {
  Controller,
  Get,
  Delete,
  Param,
  Query,
  UseGuards,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ResultService } from './result.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { MustChangePasswordGuard } from '../../common/guards/must-change-password.guard';

@UseGuards(JwtAuthGuard, MustChangePasswordGuard)
@Controller('admin')
export class ResultController {
  constructor(private readonly resultService: ResultService) {}

  @Get('dashboard/stats')
  async getDashboardStats() {
    return this.resultService.getDashboardStats();
  }

  @Get('results')
  async findAll(@Query() query: any) {
    return this.resultService.findAll(query);
  }

  @Get('results/export')
  async exportResults(@Query('format') format: 'csv' | 'xlsx' = 'csv', @Query() query: any, @Res() res: Response) {
    const file = await this.resultService.exportResults(format || 'csv', query);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.send(file.buffer);
  }

  @Get('results/:id')
  async findOne(@Param('id') id: string) {
    return this.resultService.findOne(id);
  }

  @Delete('results/:id')
  async deleteResult(@Param('id') id: string) {
    return this.resultService.deleteResult(id);
  }
}

