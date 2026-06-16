import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SyncState } from './sync-state.entity';
import { SyncStateService } from './sync-state.service';

// Controle de sincronização por fonte+UF. Exporta o serviço para o job (T-18).
@Module({
  imports: [TypeOrmModule.forFeature([SyncState])],
  providers: [SyncStateService],
  exports: [SyncStateService],
})
export class SyncModule {}
