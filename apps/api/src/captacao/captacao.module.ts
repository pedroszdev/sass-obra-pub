import { Module } from '@nestjs/common';
import { EditaisModule } from '../editais/editais.module';
import { UsersModule } from '../users/users.module';
import { CaptacaoController } from './captacao.controller';
import { CaptacaoJobService } from './captacao-job.service';

// O job agendado e o disparo manual (CaptacaoController) delegam ao
// UfCaptureService (exportado pelo EditaisModule); as UFs ativas vêm do
// UsersModule. O agendamento em si vem do ScheduleModule (no AppModule).
@Module({
  imports: [EditaisModule, UsersModule],
  controllers: [CaptacaoController],
  providers: [CaptacaoJobService],
  exports: [CaptacaoJobService],
})
export class CaptacaoModule {}
