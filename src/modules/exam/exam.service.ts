import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Exam, ExamDocument } from '../../database/schemas/exam.schema';
import { Question, QuestionDocument } from '../../database/schemas/question.schema';
import { CreateExamDto } from './dto/create-exam.dto';

@Injectable()
export class ExamService {
  private readonly logger = new Logger(ExamService.name);

  constructor(
    @InjectModel(Exam.name) private examModel: Model<ExamDocument>,
    @InjectModel(Question.name) private questionModel: Model<QuestionDocument>,
  ) {}

  async create(dto: CreateExamDto, adminId?: string): Promise<Exam> {
    const slug = dto.slug.toLowerCase().trim();
    const existing = await this.examModel.findOne({ slug });
    if (existing) {
      throw new ConflictException(`Exam with slug "${slug}" already exists`);
    }

    if (dto.isPublished) {
      await this.validateQuestionsAvailable(dto.difficulty, dto.questionCount || 100);
    }

    return this.examModel.create({
      ...dto,
      slug,
      createdBy: adminId ? new Types.ObjectId(adminId) : undefined,
    });
  }

  async findAll(query: { isPublished?: string; isActive?: string; difficulty?: string }) {
    const filter: any = {};
    if (query.isPublished !== undefined && query.isPublished !== '') {
      filter.isPublished = query.isPublished === 'true';
    }
    if (query.isActive !== undefined && query.isActive !== '') {
      filter.isActive = query.isActive === 'true';
    }
    if (query.difficulty) {
      filter.difficulty = query.difficulty;
    }

    return this.examModel.find(filter).sort({ createdAt: -1 }).lean();
  }

  async findOne(id: string): Promise<Exam> {
    const exam = await this.examModel.findById(id);
    if (!exam) {
      throw new NotFoundException('Exam not found');
    }
    return exam;
  }

  async findBySlugPublic(slug: string) {
    const exam = await this.examModel.findOne({
      slug: slug.toLowerCase().trim(),
      isPublished: true,
      isActive: true,
    }).lean();

    if (!exam) {
      throw new NotFoundException('Exam not found or is currently not active/published');
    }

    return {
      id: (exam as any)._id.toString(),
      title: exam.title,
      slug: exam.slug,
      description: exam.description,
      difficulty: exam.difficulty,
      questionCount: exam.questionCount,
      durationMinutes: exam.durationMinutes,
      passingPercentage: exam.passingPercentage,
      negativeMarking: exam.negativeMarking,
      instructions: exam.instructions,
      allowRetakes: exam.allowRetakes,
      maxAttempts: exam.maxAttempts,
      isLocked: exam.isLocked || false,
      lockedReason: exam.lockedReason || null,
    };
  }

  async findActiveDefaultExam() {
    const exam = await this.examModel
      .findOne({
        isPublished: true,
        isActive: true,
      })
      .sort({ createdAt: -1 })
      .lean();

    if (!exam) {
      throw new NotFoundException('No active published examination found');
    }

    return {
      id: (exam as any)._id.toString(),
      title: exam.title,
      slug: exam.slug,
      description: exam.description,
      difficulty: exam.difficulty,
      questionCount: exam.questionCount,
      durationMinutes: exam.durationMinutes,
      passingPercentage: exam.passingPercentage,
      negativeMarking: exam.negativeMarking,
      instructions: exam.instructions,
      allowRetakes: exam.allowRetakes,
      maxAttempts: exam.maxAttempts,
      isLocked: exam.isLocked || false,
      lockedReason: exam.lockedReason || null,
    };
  }

  async update(id: string, dto: Partial<CreateExamDto>): Promise<Exam> {
    if (dto.slug) {
      dto.slug = dto.slug.toLowerCase().trim();
      const existing = await this.examModel.findOne({
        slug: dto.slug,
        _id: { $ne: id },
      });
      if (existing) {
        throw new ConflictException(`Exam with slug "${dto.slug}" already exists`);
      }
    }

    const currentExam = await this.examModel.findById(id);
    if (!currentExam) {
      throw new NotFoundException('Exam not found');
    }

    const targetDifficulty = dto.difficulty || currentExam.difficulty;
    const targetCount = dto.questionCount !== undefined ? dto.questionCount : currentExam.questionCount;
    const willBePublished = dto.isPublished !== undefined ? dto.isPublished : currentExam.isPublished;

    if (willBePublished) {
      await this.validateQuestionsAvailable(targetDifficulty, targetCount);
    }

    const updated = await this.examModel.findByIdAndUpdate(
      id,
      { $set: dto },
      { new: true },
    );
    return updated;
  }

  async togglePublish(id: string, publish: boolean) {
    const exam = await this.examModel.findById(id);
    if (!exam) {
      throw new NotFoundException('Exam not found');
    }

    if (publish) {
      await this.validateQuestionsAvailable(exam.difficulty, exam.questionCount);
    }

    exam.isPublished = publish;
    return exam.save();
  }

  async remove(id: string) {
    const exam = await this.examModel.findByIdAndDelete(id);
    if (!exam) {
      throw new NotFoundException('Exam not found');
    }
    return { message: 'Exam deleted successfully' };
  }

  async restartExam(id: string) {
    const exam = await this.examModel.findById(id);
    if (!exam) {
      throw new NotFoundException('Exam not found');
    }

    exam.isLocked = false;
    exam.lockedReason = null;
    exam.lastRestartedAt = new Date();
    await exam.save();

    return {
      success: true,
      message: 'Examination link restarted successfully. Candidates can now use this link again.',
      exam,
    };
  }

  private async validateQuestionsAvailable(difficulty: string, requiredCount: number) {
    const eligibleCount = await this.questionModel.countDocuments({
      difficulty,
      isApproved: true,
      isActive: true,
    });

    if (eligibleCount < requiredCount) {
      throw new BadRequestException(
        `Insufficient approved questions in question bank for difficulty "${difficulty}". Required: ${requiredCount}, Available: ${eligibleCount}. Please import or approve more questions before publishing.`,
      );
    }
  }
}

