import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Connection, Types } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Candidate, CandidateDocument } from '../../database/schemas/candidate.schema';
import { Exam, ExamDocument } from '../../database/schemas/exam.schema';
import { Question, QuestionDocument } from '../../database/schemas/question.schema';
import {
  ExamAttempt,
  AttemptDocument,
  AttemptStatus,
  AssignedQuestion,
  PrivateAnswerKeyItem,
  SavedResponse,
} from '../../database/schemas/attempt.schema';
import { RegisterCandidateDto } from './dto/register-candidate.dto';

@Injectable()
export class CandidateService {
  private readonly logger = new Logger(CandidateService.name);

  constructor(
    @InjectModel(Candidate.name) private candidateModel: Model<CandidateDocument>,
    @InjectModel(Exam.name) private examModel: Model<ExamDocument>,
    @InjectModel(Question.name) private questionModel: Model<QuestionDocument>,
    @InjectModel(ExamAttempt.name) private attemptModel: Model<AttemptDocument>,
    @InjectConnection() private readonly connection: Connection,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) { }

  async registerCandidate(slug: string, dto: RegisterCandidateDto) {
    const normalizedEmail = dto.email.toLowerCase().trim();

    // 1. Resolve or create Candidate record securely on the server
    let candidate = await this.candidateModel.findOne({ email: normalizedEmail });
    if (!candidate) {
      candidate = await this.candidateModel.create({
        name: dto.name.trim(),
        email: normalizedEmail,
        phone: dto.phone.trim(),
        jobPosition: dto.jobPosition.trim(),
      });
    } else {
      // Update phone/position if changed
      candidate.name = dto.name.trim();
      candidate.phone = dto.phone.trim();
      candidate.jobPosition = dto.jobPosition.trim();
      await candidate.save();
    }

    const exam = await this.examModel.findOne({
      slug: slug.toLowerCase().trim(),
      isPublished: true,
      isActive: true,
    });

    if (!exam) {
      throw new NotFoundException('Exam not found or is currently inactive');
    }

    if (exam.isLocked) {
      throw new ForbiddenException({
        statusCode: HttpStatus.FORBIDDEN,
        error: 'EXAM_LOCKED',
        message: 'This examination link has already been used and completed. It is currently locked until an administrator restarts it.',
      });
    }

    // 2. Select and prepare questions from the bank
    const eligibleQuestions = await this.questionModel
      .find({
        difficulty: exam.difficulty,
        isApproved: true,
        isActive: true,
      })
      .select('+correctOptionId')
      .lean();

    if (eligibleQuestions.length < exam.questionCount) {
      throw new BadRequestException(
        `Exam cannot be started: Insufficient approved questions in question bank (${eligibleQuestions.length}/${exam.questionCount}). Please contact administrator.`,
      );
    }

    // Shuffle and pick exactly questionCount questions
    const shuffledPool = this.shuffleArray([...eligibleQuestions]);
    const selectedQuestions = shuffledPool.slice(0, exam.questionCount);

    const assignedQuestions: AssignedQuestion[] = [];
    const privateAnswerKey: PrivateAnswerKeyItem[] = [];
    const savedResponses: SavedResponse[] = [];

    for (const q of selectedQuestions) {
      const qId = (q as any)._id.toString();

      // Independently shuffle options for this attempt
      const shuffledOptions = this.shuffleArray(
        q.options.map((opt) => ({
          optionId: opt.optionId,
          text: opt.text,
        })),
      );

      assignedQuestions.push({
        questionId: qId,
        questionText: q.questionText,
        topic: q.topic,
        marks: q.marks,
        options: shuffledOptions,
      });

      privateAnswerKey.push({
        questionId: qId,
        correctOptionId: q.correctOptionId,
        marks: q.marks,
      });

      savedResponses.push({
        questionId: qId,
        selectedOptionId: null,
        revision: 1,
        updatedAt: new Date(),
      });
    }

    // 3. Adaptive Bounded Retry Loop for Atomic Sequence Allocation & Unique Index Enforcement
    const maxRetries = 5;
    let attempt = 0;
    let createdAttempt: AttemptDocument | null = null;

    while (attempt < maxRetries) {
      attempt++;
      let session: any = null;
      try {
        session = await this.connection.startSession();
      } catch (e) {
        session = null;
      }

      try {
        if (session) {
          try {
            await session.withTransaction(async () => {
              const sessionExam = await this.examModel.findById(exam._id).session(session);
              if (!sessionExam || !sessionExam.isPublished || !sessionExam.isActive) {
                throw new BadRequestException('Exam is not active');
              }

              const attemptFilter: any = { candidateId: candidate._id, examId: sessionExam._id };
              if (sessionExam.lastRestartedAt) {
                attemptFilter.createdAt = { $gt: sessionExam.lastRestartedAt };
              }

              const existingCount = await this.attemptModel
                .countDocuments(attemptFilter)
                .session(session);

              if (!sessionExam.allowRetakes && existingCount >= 1) {
                throw new ConflictException('Retakes are not permitted for this examination. If this was intentional, please contact the administrator to restart the exam link.');
              }
              if (existingCount >= sessionExam.maxAttempts) {
                throw new ConflictException(`Maximum attempt limit (${sessionExam.maxAttempts}) reached for this examination`);
              }

              const nextAttemptNumber = existingCount + 1;
              const [newAttempt] = await this.attemptModel.create(
                [
                  {
                    candidateId: candidate._id,
                    examId: sessionExam._id,
                    attemptNumber: nextAttemptNumber,
                    status: AttemptStatus.CREATED,
                    examSnapshot: {
                      questionCount: sessionExam.questionCount,
                      durationMinutes: sessionExam.durationMinutes,
                      passingPercentage: sessionExam.passingPercentage,
                      marksPerQuestion: sessionExam.marksPerQuestion,
                      negativeMarking: sessionExam.negativeMarking,
                      negativeMarksPerQuestion: sessionExam.negativeMarksPerQuestion,
                    },
                    assignedQuestions,
                    privateAnswerKey,
                    savedResponses,
                    finalizationFencingToken: 0,
                  },
                ],
                { session },
              );
              createdAttempt = newAttempt;
            }, { writeConcern: { w: 'majority', j: true } });
          } catch (txError: any) {
            if (txError.message?.includes('replica set member')) {
              // Standalone MongoDB fallback
              createdAttempt = await this.executeRegistrationDirect(
                candidate,
                exam,
                assignedQuestions,
                privateAnswerKey,
                savedResponses,
              );
            } else {
              throw txError;
            }
          }
        } else {
          createdAttempt = await this.executeRegistrationDirect(
            candidate,
            exam,
            assignedQuestions,
            privateAnswerKey,
            savedResponses,
          );
        }

        if (createdAttempt) break;
      } catch (err) {
        const isDuplicateKey = err?.code === 11000 || err?.message?.includes('E11000');
        const isTransient = err?.hasErrorLabel?.('TransientTransactionError') || err?.message?.includes('WriteConflict');

        if ((isDuplicateKey || isTransient) && attempt < maxRetries) {
          const delay = Math.min(1000, Math.pow(2, attempt) * 50 + Math.random() * 50);
          await new Promise((res) => setTimeout(res, delay));
          continue;
        }
        throw err;
      } finally {
        if (session) {
          await session.endSession();
        }
      }
    }

    if (!createdAttempt) {
      throw new HttpException('Registration contention high. Please retry.', HttpStatus.TOO_MANY_REQUESTS);
    }

    // 4. Issue Scoped Attempt JWT Token
    const attemptToken = this.issueAttemptToken(candidate._id.toString(), createdAttempt._id.toString(), exam._id.toString());

    return {
      message: 'Candidate registered successfully for examination',
      attemptToken,
      attemptId: createdAttempt._id.toString(),
      attemptNumber: createdAttempt.attemptNumber,
      candidate: {
        id: candidate._id.toString(),
        name: candidate.name,
        email: candidate.email,
        jobPosition: candidate.jobPosition,
      },
      exam: {
        id: exam._id.toString(),
        title: exam.title,
        slug: exam.slug,
        durationMinutes: exam.durationMinutes,
        questionCount: exam.questionCount,
        instructions: exam.instructions,
      },
    };
  }

  private async executeRegistrationDirect(
    candidate: CandidateDocument,
    exam: ExamDocument,
    assignedQuestions: AssignedQuestion[],
    privateAnswerKey: PrivateAnswerKeyItem[],
    savedResponses: SavedResponse[],
  ): Promise<AttemptDocument> {
    const attemptFilter: any = { candidateId: candidate._id, examId: exam._id };
    if (exam.lastRestartedAt) {
      attemptFilter.createdAt = { $gt: exam.lastRestartedAt };
    }

    const existingCount = await this.attemptModel.countDocuments(attemptFilter);

    if (!exam.allowRetakes && existingCount >= 1) {
      throw new ConflictException('Retakes are not permitted for this examination. If this was intentional, please ask your administrator to restart the exam link.');
    }
    if (existingCount >= exam.maxAttempts) {
      throw new ConflictException(`Maximum attempt limit (${exam.maxAttempts}) reached for this examination`);
    }

    const nextAttemptNumber = existingCount + 1;
    return this.attemptModel.create({
      candidateId: candidate._id,
      examId: exam._id,
      attemptNumber: nextAttemptNumber,
      status: AttemptStatus.CREATED,
      examSnapshot: {
        questionCount: exam.questionCount,
        durationMinutes: exam.durationMinutes,
        passingPercentage: exam.passingPercentage,
        marksPerQuestion: exam.marksPerQuestion,
        negativeMarking: exam.negativeMarking,
        negativeMarksPerQuestion: exam.negativeMarksPerQuestion,
      },
      assignedQuestions,
      privateAnswerKey,
      savedResponses,
      finalizationFencingToken: 0,
    });
  }

  issueAttemptToken(candidateId: string, attemptId: string, examId: string): string {
    const payload = {
      iss: 'hiverift-exam-portal',
      aud: 'hiverift-candidate',
      sub: candidateId,
      attemptId,
      examId,
    };
    // 24-hour registration session validity before start
    return this.jwtService.sign(payload, {
      secret: this.configService.get<string>('jwt.secret'),
      expiresIn: '24h',
    });
  }

  private shuffleArray<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }
}
