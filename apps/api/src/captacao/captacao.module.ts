import { Module } from '@nestjs/common';
import { EditaisModule } from '../editais/editais.module';
import { SyncModule } from '../editais/sync/sync.module';
import { UsersModule } from '../users/users.module';
import { CaptacaoController } from './captacao.controller';
import { CaptacaoJobService } from './captacao-job.service';

// Amarra o job aos conectores (EditaisModule), à ingestão, ao controle de sync
// e aos usuários. O agendamento em si vem do ScheduleModule (no AppModule);
// o CaptacaoController expõe o disparo manual (ops).
@Module({
  imports: [EditaisModule, SyncModule, UsersModule],
  controllers: [CaptacaoController],
  providers: [CaptacaoJobService],
  exports: [CaptacaoJobService],
})
export class CaptacaoModule {}
