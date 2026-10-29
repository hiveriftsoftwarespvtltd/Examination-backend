import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Connection } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import {
  ExamAttempt,
  AttemptDocument,
  AttemptStatus,
} from '../../database/schemas/attempt.schema';
import { Result, ResultDocument } from '../../database/schemas/result.schema';
import { Exam, ExamDocument } from '../../database/schemas/exam.schema';

@Injectable()
export class EvaluationService {
  private readonly logger = new Logger(EvaluationService.name);
  private readonly workerInstanceId = `worker_${process.pid}_${Math.random().toString(36).substring(2, 9)}`;

  constructor(
    @InjectModel(ExamAttempt.name) private attemptModel: Model<AttemptDocument>,
    @InjectModel(Result.name) private resultModel: Model<ResultDocument>,
    @InjectModel(Exam.name) private examModel: Model<ExamDocument>,
    @InjectConnection() private readonly connection: Connection,
    private configService: ConfigService,
  ) {}

  async submitCandidateExam(attemptId: string) {
    const attempt = await this.attemptModel.findById(attemptId).select('+privateAnswerKey');
    if (!attempt) {
      throw new NotFoundException('Examination attempt not found');
    }

    if (attempt.status === AttemptStatus.COMPLETED) {
      return {
        success: true,
        message: 'Your exam has been submitted successfully.',
      };
    }

    if (attempt.status !== AttemptStatus.IN_PROGRESS) {
      throw new ForbiddenException(`Cannot submit exam in status "${attempt.status}"`);
    }

    const now = new Date();
    const transitGraceMs = this.configService.get<number>('timing.submissionTransitGraceMs') || 15000;
    const maxSubmissionWindow = new Date(attempt.deadline.getTime() + transitGraceMs);

    if (now.getTime() > maxSubmissionWindow.getTime()) {
      throw new ForbiddenException({
        message: 'Submission window expired. The attempt is being finalized automatically by the system.',
        code: 'DEADLINE_EXPIRED',
      });
    }

    // Phase 1: Durable Claim Outside Transaction
    const claimedAttempt = await this.attemptModel.findOneAndUpdate(
      {
        _id: attemptId,
        status: AttemptStatus.IN_PROGRESS,
      },
      {
        $set: {
          status: AttemptStatus.FINALIZING,
          workerLockId: this.workerInstanceId,
          leaseExpiresAt: new Date(Date.now() + 30000),
          finalizingStartedAt: new Date(),
        },
        $inc: { finalizationFencingToken: 1 },
      },
      { new: true },
    ).select('+privateAnswerKey');

    if (!claimedAttempt) {
      // Already claimed or completed concurrently
      return {
        success: true,
        message: 'Your exam has been submitted successfully.',
      };
    }

    // Phase 2: Transactional Evaluation & Result Creation
    await this.evaluateAndPersist(
      claimedAttempt,
      this.workerInstanceId,
      claimedAttempt.finalizationFencingToken,
    );

    return {
      success: true,
      message: 'Your exam has been submitted successfully.',
    };
  }

  async evaluateAndPersist(
    attempt: AttemptDocument,
    workerLockId: string,
    activeFencingToken: number,
  ) {
    const attemptId = attempt._id.toString();
    let session: any = null;
    try {
      session = await this.connection.startSession();
    } catch (e) {
      session = null;
    }

    try {
      if (session) {
        try {
          await session.withTransaction(
            async () => {
              let result = await this.resultModel.findOne({ attemptId }).session(session);

              if (!result) {
                const evaluation = this.calculateEvaluation(attempt);
                const [createdResult] = await this.resultModel.create(
                  [
                    {
                      attemptId: attempt._id,
                      candidateId: attempt.candidateId,
                      examId: attempt.examId,
                      ...evaluation,
                      calculatedAt: new Date(),
                    },
                  ],
                  { session },
                );
                result = createdResult;
              }

              const now = new Date();
              const updatedAttempt = await this.attemptModel.findOneAndUpdate(
                {
                  _id: attempt._id,
                  status: AttemptStatus.FINALIZING,
                  finalizationFencingToken: activeFencingToken,
                  leaseExpiresAt: { $gt: now },
                },
                {
                  $set: {
                    status: AttemptStatus.COMPLETED,
                    submittedAt: now,
                    resultId: result._id,
                    timeTakenSeconds: attempt.startedAt
                      ? Math.max(0, Math.floor((now.getTime() - attempt.startedAt.getTime()) / 1000))
                      : 0,
                  },
                },
                { session, new: true },
              );

              if (!updatedAttempt) {
                this.logger.warn(`Fencing token mismatch or expired lease for attempt ${attemptId}. Aborting commit.`);
                throw new Error('Lease expired or ownership superseded by another worker');
              }
            },
            { writeConcern: { w: 'majority', j: true } },
          );
        } catch (txError: any) {
          if (txError.message?.includes('replica set member')) {
            // Standalone MongoDB fallback
            await this.executeEvaluationDirect(attempt, activeFencingToken);
          } else {
            throw txError;
          }
        }
      } else {
        await this.executeEvaluationDirect(attempt, activeFencingToken);
      }

      this.logger.log(`Attempt ${attemptId} finalized successfully into COMPLETED state.`);
    } finally {
      if (session) {
        await session.endSession();
      }
    }
  }

  private async executeEvaluationDirect(
    attempt: AttemptDocument,
    activeFencingToken: number,
  ) {
    const attemptId = attempt._id.toString();
    let result = await this.resultModel.findOne({ attemptId });

    if (!result) {
      const evaluation = this.calculateEvaluation(attempt);
      result = await this.resultModel.create({
        attemptId: attempt._id,
        candidateId: attempt.candidateId,
        examId: attempt.examId,
        ...evaluation,
        calculatedAt: new Date(),
      });
    }

    const now = new Date();
    const updatedAttempt = await this.attemptModel.findOneAndUpdate(
      {
        _id: attempt._id,
        status: AttemptStatus.FINALIZING,
        finalizationFencingToken: activeFencingToken,
        leaseExpiresAt: { $gt: now },
      },
      {
        $set: {
          status: AttemptStatus.COMPLETED,
          submittedAt: now,
          resultId: result._id,
          timeTakenSeconds: attempt.startedAt
            ? Math.max(0, Math.floor((now.getTime() - attempt.startedAt.getTime()) / 1000))
            : 0,
        },
      },
      { new: true },
    );

    if (!updatedAttempt) {
      this.logger.warn(`Fencing token mismatch or expired lease for attempt ${attemptId}.`);
      throw new Error('Lease expired or ownership superseded by another worker');
    }

    // Lock the examination link upon completion so it cannot be used again until admin restarts it
    await this.examModel.updateOne(
      { _id: attempt.examId },
      {
        $set: {
          isLocked: true,
          lockedReason: 'COMPLETED',
          lastLockedAt: now,
        },
      },
    );
  }

  calculateEvaluation(attempt: AttemptDocument) {
    const snapshot = attempt.examSnapshot;
    const answerKey = attempt.privateAnswerKey || [];
    const responses = attempt.savedResponses || [];

    let correctCount = 0;
    let incorrectCount = 0;
    let unansweredCount = 0;
    let rawMarks = 0;

    const answerMap = new Map<string, string>();
    for (const item of answerKey) {
      answerMap.set(item.questionId, item.correctOptionId);
    }

    const marksPerQuestion = snapshot.marksPerQuestion || 1;
    const negativePenalty = snapshot.negativeMarking ? (snapshot.negativeMarksPerQuestion || 0) : 0;

    for (const q of attempt.assignedQuestions) {
      const qId = q.questionId;
      const resp = responses.find((r) => r.questionId === qId);
      const selectedOpt = resp?.selectedOptionId || null;
      const correctOpt = answerMap.get(qId);

      if (!selectedOpt) {
        unansweredCount++;
      } else if (selectedOpt === correctOpt) {
        correctCount++;
        rawMarks += marksPerQuestion;
      } else {
        incorrectCount++;
        if (snapshot.negativeMarking) {
          rawMarks -= negativePenalty;
        }
      }
    }

    const totalQuestions = attempt.assignedQuestions.length;
    const totalPossibleMarks = totalQuestions * marksPerQuestion;

    // Zero-floor rule: prevents negative total score when candidates answer mostly incorrectly
    const marksObtained = Math.max(0, Number(rawMarks.toFixed(2)));

    // Calculate percentage rounded strictly to 2 decimal places
    let percentage = 0;
    if (totalPossibleMarks > 0) {
      percentage = Number(((marksObtained / totalPossibleMarks) * 100).toFixed(2));
    }

    const passingPercentage = snapshot.passingPercentage || 50;
    const isPassed = percentage >= passingPercentage;

    return {
      totalQuestions,
      correctAnswers: correctCount,
      incorrectAnswers: incorrectCount,
      unansweredQuestions: unansweredCount,
      totalPossibleMarks,
      marksObtained,
      percentage,
      passingPercentage,
      isPassed,
    };
  }

  async renewLease(attemptId: string, workerLockId: string, fencingToken: number): Promise<boolean> {
    const result = await this.attemptModel.updateOne(
      {
        _id: attemptId,
        status: AttemptStatus.FINALIZING,
        workerLockId,
        finalizationFencingToken: fencingToken,
        leaseExpiresAt: { $gt: new Date() },
      },
      {
        $set: { leaseExpiresAt: new Date(Date.now() + 30000) },
      },
    );
    return result.modifiedCount > 0;
  }
}
