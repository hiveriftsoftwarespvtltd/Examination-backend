import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import {
  ExamAttempt,
  AttemptDocument,
  AttemptStatus,
} from '../../database/schemas/attempt.schema';
import { EvaluationService } from '../evaluation/evaluation.service';

@Injectable()
export class RecoveryService {
  private readonly logger = new Logger(RecoveryService.name);
  private readonly workerInstanceId = `watchdog_${process.pid}_${Math.random().toString(36).substring(2, 9)}`;
  private isProcessing = false;

  constructor(
    @InjectModel(ExamAttempt.name) private attemptModel: Model<AttemptDocument>,
    private evaluationService: EvaluationService,
    private configService: ConfigService,
  ) {}

  @Cron('*/15 * * * * *') // Scan every 15 seconds
  async handleRecoveryScan() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      await this.recoverExpiredInProgressAttempts();
      await this.recoverStuckFinalizingAttempts();
    } catch (err) {
      this.logger.error(`Error during recovery scan: ${err.message}`, err.stack);
    } finally {
      this.isProcessing = false;
    }
  }

  private async recoverExpiredInProgressAttempts() {
    const transitGraceMs = this.configService.get<number>('timing.submissionTransitGraceMs') || 15000;
    // Only claim attempts whose deadline + 15s grace has passed!
    const expiredCutoff = new Date(Date.now() - transitGraceMs);

    const expiredAttempts = await this.attemptModel
      .find({
        status: AttemptStatus.IN_PROGRESS,
        deadline: { $lt: expiredCutoff },
      })
      .limit(10);

    for (const attempt of expiredAttempts) {
      const claimed = await this.attemptModel.findOneAndUpdate(
        {
          _id: attempt._id,
          status: AttemptStatus.IN_PROGRESS,
          deadline: { $lt: expiredCutoff },
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

      if (claimed) {
        this.logger.log(`Watchdog claimed expired attempt ${claimed._id} with fencingToken ${claimed.finalizationFencingToken}`);
        try {
          await this.evaluationService.evaluateAndPersist(
            claimed,
            this.workerInstanceId,
            claimed.finalizationFencingToken,
          );
        } catch (err) {
          this.logger.error(`Watchdog failed to evaluate attempt ${claimed._id}: ${err.message}`);
        }
      }
    }
  }

  private async recoverStuckFinalizingAttempts() {
    const now = new Date();

    const stuckAttempts = await this.attemptModel
      .find({
        status: AttemptStatus.FINALIZING,
        leaseExpiresAt: { $lt: now },
      })
      .limit(10);

    for (const attempt of stuckAttempts) {
      const reclaimed = await this.attemptModel.findOneAndUpdate(
        {
          _id: attempt._id,
          status: AttemptStatus.FINALIZING,
          leaseExpiresAt: { $lt: now },
        },
        {
          $set: {
            workerLockId: this.workerInstanceId,
            leaseExpiresAt: new Date(Date.now() + 30000),
            finalizingStartedAt: new Date(),
          },
          $inc: { finalizationFencingToken: 1 },
        },
        { new: true },
      ).select('+privateAnswerKey');

      if (reclaimed) {
        this.logger.log(`Watchdog reclaimed stuck finalizing attempt ${reclaimed._id} with new fencingToken ${reclaimed.finalizationFencingToken}`);
        try {
          await this.evaluationService.evaluateAndPersist(
            reclaimed,
            this.workerInstanceId,
            reclaimed.finalizationFencingToken,
          );
        } catch (err) {
          this.logger.error(`Watchdog failed to evaluate reclaimed attempt ${reclaimed._id}: ${err.message}`);
        }
      }
    }
  }
}

