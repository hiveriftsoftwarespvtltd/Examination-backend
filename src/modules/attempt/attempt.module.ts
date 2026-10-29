import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { AttemptService } from './attempt.service';
import { AttemptController } from './attempt.controller';

@Module({
  imports: [JwtModule.register({}), ConfigModule],
  controllers: [AttemptController],
  providers: [AttemptService],
  exports: [AttemptService],
})
export class AttemptModule {}

