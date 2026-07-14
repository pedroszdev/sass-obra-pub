import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TerminusModule } from '@nestjs/terminus';
import { SyncRun } from '../editais/sync/sync-run.entity';
import { CaptacaoHealthIndicator } from './captacao.health';
import { HealthController } from './health.controller';

@Module({
  imports: [TerminusModule, TypeOrmModule.forFeature([SyncRun])],
  controllers: [HealthController],
  providers: [CaptacaoHealthIndicator],
})
export class HealthModule {}
