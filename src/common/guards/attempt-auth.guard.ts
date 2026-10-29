import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ExamAttempt, AttemptDocument } from '../../database/schemas/attempt.schema';

@Injectable()
export class AttemptAuthGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    @InjectModel(ExamAttempt.name) private attemptModel: Model<AttemptDocument>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Candidate attempt authorization token required');
    }

    const token = authHeader.split(' ')[1];
    let payload: any;
    try {
      payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('jwt.secret'),
      });
    } catch (err) {
      throw new UnauthorizedException('Invalid or expired candidate attempt token');
    }

    if (payload.iss !== 'hiverift-exam-portal' || payload.aud !== 'hiverift-candidate') {
      throw new ForbiddenException('Invalid token claims (issuer or audience mismatch)');
    }

    const attempt = await this.attemptModel.findById(payload.attemptId).select('+privateAnswerKey');
    if (!attempt) {
      throw new UnauthorizedException('Associated examination attempt not found');
    }

    // Ownership check
    if (attempt.candidateId.toString() !== payload.sub) {
      throw new ForbiddenException('Unauthorized: Token does not match attempt candidate identity');
    }

    request.attempt = attempt;
    request.candidateId = payload.sub;
    request.attemptId = payload.attemptId;
    return true;
  }
}

