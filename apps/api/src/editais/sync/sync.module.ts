import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SyncRun } from './sync-run.entity';
import { SyncRunService } from './sync-run.service';
import { SyncState } from './sync-state.entity';
import { SyncStateService } from './sync-state.service';

// Controle de sincronização (estado atual) + histórico de execuções.
// Exporta os serviços para o job (T-18/T-19).
@Module({
  imports: [TypeOrmModule.forFeature([SyncState, SyncRun])],
  providers: [SyncStateService, SyncRunService],
  exports: [SyncStateService, SyncRunService],
})
export class SyncModule {}
