import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { Admin, AdminDocument, AdminRole, AdminStatus } from './schemas/admin.schema';
import { Exam, ExamDocument, DifficultyLevel } from './schemas/exam.schema';
import { Question, QuestionDocument } from './schemas/question.schema';

@Injectable()
export class SeederService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeederService.name);

  constructor(
    @InjectModel(Admin.name) private adminModel: Model<AdminDocument>,
    @InjectModel(Exam.name) private examModel: Model<ExamDocument>,
    @InjectModel(Question.name) private questionModel: Model<QuestionDocument>,
    private configService: ConfigService,
  ) {}

  async onApplicationBootstrap() {
    await this.seedSuperAdmin();
    await this.seedInitialQuestionsAndExam();
  }

  private async seedSuperAdmin() {
    const adminEmail = (this.configService.get<string>('bootstrapAdmin.email') || 'hiverift@gmail.com').toLowerCase().trim();
    const adminPassword = this.configService.get<string>('bootstrapAdmin.password') || '123456';

    const existingAdmin = await this.adminModel.findOne({ email: adminEmail });
    if (!existingAdmin) {
      const passwordHash = await bcrypt.hash(adminPassword, 12);
      await this.adminModel.create({
        name: 'HiveRift Super Admin',
        email: adminEmail,
        passwordHash,
        role: AdminRole.SUPER_ADMIN,
        status: AdminStatus.ACTIVE,
        mustChangePassword: false,
      });
      this.logger.log(`Super Admin provisioned successfully: ${adminEmail}`);
    } else {
      this.logger.log(`Super Admin already exists: ${adminEmail}`);
    }
  }

  private async seedInitialQuestionsAndExam() {
    const totalQuestions = await this.questionModel.countDocuments();
    if (totalQuestions < 50) {
      this.logger.log('Seeding baseline question bank with high-quality MCQs across all 5 difficulties...');
      const sampleTopics = ['JavaScript & TypeScript', 'Backend Architecture & Node.js', 'Database Systems & MongoDB', 'Data Structures & Algorithms', 'Web Security & OWASP'];
      const difficulties = [
        DifficultyLevel.BEGINNER,
        DifficultyLevel.INTERMEDIATE,
        DifficultyLevel.ADVANCED,
        DifficultyLevel.EXPERT,
        DifficultyLevel.VERY_HARD,
      ];
      const questionsToInsert: any[] = [];

      for (const diff of difficulties) {
        for (let i = 1; i <= 15; i++) {
          const topic = sampleTopics[(i - 1) % sampleTopics.length];
          questionsToInsert.push({
            questionText: `[${diff}] Technical Assessment Question #${i}: What is the primary operational consideration for ${topic} in a high-scale production system?`,
            options: [
              { optionId: 'opt_1', text: `Option A: Implement strict concurrency control, caching, and comprehensive monitoring.` },
              { optionId: 'opt_2', text: `Option B: Disable validation and index verification to reduce CPU load.` },
              { optionId: 'opt_3', text: `Option C: Store all state in ephemeral client-side memory without persistence.` },
              { optionId: 'opt_4', text: `Option D: Execute all operations synchronously on a single blocking thread.` },
            ],
            correctOptionId: 'opt_1',
            topic,
            difficulty: diff,
            marks: 1,
            isApproved: true,
            isActive: true,
            explanation: `Option A represents the industry standard practice for ensuring reliability, data integrity, and high performance.`,
          });
        }
      }

      await this.questionModel.insertMany(questionsToInsert);
      this.logger.log(`Seeded ${questionsToInsert.length} baseline approved questions across all difficulties.`);
    }

    const examCount = await this.examModel.countDocuments();
    if (examCount === 0) {
      await this.examModel.create({
        title: 'HiveRift Full-Stack Engineering Assessment 2026',
        slug: 'hiverift-fullstack-2026',
        description: 'Comprehensive assessment evaluating backend architecture, database integrity, concurrency, and security.',
        difficulty: DifficultyLevel.INTERMEDIATE,
        questionCount: 10,
        durationMinutes: 30,
        passingPercentage: 60,
        marksPerQuestion: 1,
        negativeMarking: false,
        negativeMarksPerQuestion: 0,
        allowRetakes: false,
        maxAttempts: 1,
        isPublished: true,
        isActive: true,
        instructions: '1. Ensure stable internet connectivity.\n2. Answers are autosaved automatically.\n3. The countdown timer is strictly enforced by the server.\n4. Do not refresh or navigate away unnecessarily.',
      });
      this.logger.log('Seeded initial published exam: hiverift-fullstack-2026');
    }
  }
}
