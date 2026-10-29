import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  ExamAttempt,
  AttemptDocument,
  AttemptStatus,
} from '../../database/schemas/attempt.schema';
import { Exam, ExamDocument } from '../../database/schemas/exam.schema';
import { Candidate, CandidateDocument } from '../../database/schemas/candidate.schema';
import { SaveResponseDto } from './dto/save-response.dto';

@Injectable()
export class AttemptService {
  private readonly logger = new Logger(AttemptService.name);

  constructor(
    @InjectModel(ExamAttempt.name) private attemptModel: Model<AttemptDocument>,
    @InjectModel(Exam.name) private examModel: Model<ExamDocument>,
    @InjectModel(Candidate.name) private candidateModel: Model<CandidateDocument>,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async startExam(attemptId: string) {
    const attempt = await this.attemptModel.findById(attemptId);
    if (!attempt) {
      throw new NotFoundException('Attempt not found');
    }

    if (attempt.status === AttemptStatus.COMPLETED) {
      return {
        status: AttemptStatus.COMPLETED,
        message: 'This examination has already been completed and submitted.',
      };
    }

    if (attempt.status === AttemptStatus.IN_PROGRESS) {
      // Re-connecting to already running attempt
      return this.formatSanitizedAttemptResponse(attempt);
    }

    if (attempt.status !== AttemptStatus.CREATED) {
      throw new BadRequestException(`Cannot start attempt in status "${attempt.status}"`);
    }

    const now = new Date();
    const durationMinutes = attempt.examSnapshot.durationMinutes;
    const deadline = new Date(now.getTime() + durationMinutes * 60 * 1000);

    const updated = await this.attemptModel.findOneAndUpdate(
      { _id: attemptId, status: AttemptStatus.CREATED },
      {
        $set: {
          status: AttemptStatus.IN_PROGRESS,
          startedAt: now,
          deadline,
        },
      },
      { new: true },
    );

    if (!updated) {
      throw new ConflictException('Failed to transition attempt to IN_PROGRESS. Please retry.');
    }

    // Refresh token with exact expiry at deadline + 15s
    const tokenExpiresInSeconds = Math.max(60, Math.floor((deadline.getTime() - Date.now() + 15000) / 1000));
    const refreshedToken = this.jwtService.sign(
      {
        iss: 'hiverift-exam-portal',
        aud: 'hiverift-candidate',
        sub: updated.candidateId.toString(),
        attemptId: updated._id.toString(),
        examId: updated.examId.toString(),
      },
      {
        secret: this.configService.get<string>('jwt.secret'),
        expiresIn: `${tokenExpiresInSeconds}s`,
      },
    );

    const response = await this.formatSanitizedAttemptResponse(updated);
    return {
      ...response,
      refreshedToken,
    };
  }

  async getAttemptState(attemptId: string) {
    const attempt = await this.attemptModel.findById(attemptId);
    if (!attempt) {
      throw new NotFoundException('Attempt not found');
    }
    return this.formatSanitizedAttemptResponse(attempt);
  }

  async saveResponse(attemptId: string, dto: SaveResponseDto) {
    const attempt = await this.attemptModel.findById(attemptId);
    if (!attempt) {
      throw new NotFoundException('Attempt not found');
    }

    if (attempt.status !== AttemptStatus.IN_PROGRESS) {
      throw new ForbiddenException(`Cannot save answers: Attempt is in status "${attempt.status}"`);
    }

    const now = new Date();
    if (!attempt.deadline || now.getTime() > attempt.deadline.getTime()) {
      throw new ForbiddenException({
        message: 'Examination deadline has expired. No further answer updates are permitted.',
        code: 'DEADLINE_EXPIRED',
      });
    }

    // Verify questionId exists in assignedQuestions
    const assignedQ = attempt.assignedQuestions.find((q) => q.questionId === dto.questionId);
    if (!assignedQ) {
      throw new BadRequestException('Question ID is not part of this examination attempt');
    }

    // Verify optionId is valid if not clearing selection
    if (dto.selectedOptionId !== null) {
      const validOption = assignedQ.options.some((opt) => opt.optionId === dto.selectedOptionId);
      if (!validOption) {
        throw new BadRequestException('Selected option ID is invalid for this question');
      }
    }

    // Execute atomic updateOne with $elemMatch & arrayFilters
    const result = await this.attemptModel.updateOne(
      {
        _id: attemptId,
        status: AttemptStatus.IN_PROGRESS,
        deadline: { $gt: now },
        savedResponses: {
          $elemMatch: {
            questionId: dto.questionId,
            revision: dto.expectedRevision,
          },
        },
      },
      {
        $set: {
          'savedResponses.$[elem].selectedOptionId': dto.selectedOptionId,
          'savedResponses.$[elem].updatedAt': now,
        },
        $inc: {
          'savedResponses.$[elem].revision': 1,
        },
      },
      {
        arrayFilters: [
          { 'elem.questionId': dto.questionId, 'elem.revision': dto.expectedRevision },
        ],
      },
    );

    if (result.matchedCount === 0) {
      // Conflict check: fetch current state of this question response
      const freshAttempt = await this.attemptModel.findById(attemptId);
      const currentResp = freshAttempt?.savedResponses.find((r) => r.questionId === dto.questionId);

      throw new ConflictException({
        message: 'Autosave revision conflict: A newer answer update was already processed.',
        code: 'REVISION_CONFLICT',
        currentRevision: currentResp?.revision || 1,
        selectedOptionId: currentResp?.selectedOptionId || null,
      });
    }

    return {
      success: true,
      questionId: dto.questionId,
      newRevision: dto.expectedRevision + 1,
      selectedOptionId: dto.selectedOptionId,
      serverTime: now.toISOString(),
    };
  }

  private async formatSanitizedAttemptResponse(attempt: AttemptDocument) {
    const [exam, candidate] = await Promise.all([
      this.examModel.findById(attempt.examId).lean(),
      this.candidateModel.findById(attempt.candidateId).lean(),
    ]);

    const now = new Date();
    let remainingSeconds = 0;
    if (attempt.deadline && attempt.status === AttemptStatus.IN_PROGRESS) {
      remainingSeconds = Math.max(0, Math.floor((attempt.deadline.getTime() - now.getTime()) / 1000));
    } else if (attempt.status === AttemptStatus.CREATED) {
      remainingSeconds = attempt.examSnapshot.durationMinutes * 60;
    }

    // Strictly ensure no correctOptionId or privateAnswerKey appears in the returned payload
    const sanitizedQuestions = attempt.assignedQuestions.map((q) => ({
      questionId: q.questionId,
      questionText: q.questionText,
      topic: q.topic,
      marks: q.marks,
      options: q.options.map((o) => ({
        optionId: o.optionId,
        text: o.text,
      })),
    }));

    const sanitizedResponses = attempt.savedResponses.map((r) => ({
      questionId: r.questionId,
      selectedOptionId: r.selectedOptionId,
      revision: r.revision,
      updatedAt: r.updatedAt,
    }));

    return {
      attemptId: attempt._id.toString(),
      status: attempt.status,
      attemptNumber: attempt.attemptNumber,
      startedAt: attempt.startedAt,
      deadline: attempt.deadline,
      remainingSeconds,
      serverTime: now.toISOString(),
      exam: {
        id: (exam as any)?._id.toString(),
        title: exam?.title || 'Examination',
        difficulty: exam?.difficulty,
        durationMinutes: attempt.examSnapshot.durationMinutes,
        questionCount: attempt.examSnapshot.questionCount,
        passingPercentage: attempt.examSnapshot.passingPercentage ?? exam?.passingPercentage ?? 50,
        instructions: exam?.instructions,
      },
      candidate: {
        id: (candidate as any)?._id.toString(),
        name: candidate?.name,
        email: candidate?.email,
        jobPosition: candidate?.jobPosition,
      },
      questions: sanitizedQuestions,
      savedResponses: sanitizedResponses,
    };
  }
}

