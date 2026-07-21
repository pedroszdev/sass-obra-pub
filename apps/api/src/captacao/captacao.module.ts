import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Edital } from '../editais/edital.entity';
import { EditaisModule } from '../editais/editais.module';
import { SyncRun } from '../editais/sync/sync-run.entity';
import { MailModule } from '../mail/mail.module';
import { NotificationLog } from '../notificacoes/notification-log.entity';
import { UsersModule } from '../users/users.module';
import { CaptacaoController } from './captacao.controller';
import { CaptacaoJobService } from './captacao-job.service';
import { PipelineAlertState } from './pipeline-alert-state.entity';
import { PipelineHealthAlertService } from './pipeline-health-alert.service';

// O job agendado e o disparo manual (CaptacaoController) delegam ao
// UfCaptureService (exportado pelo EditaisModule); as UFs ativas vêm do
// UsersModule. O agendamento em si vem do ScheduleModule (no AppModule).
//
// O PipelineHealthAlertService (T-189) lê sync_runs/notification_log/editais e
// avisa o dono por e-mail quando o pipeline quebra — daí MailModule e o registro
// dessas entidades + o estado de cooldown.
@Module({
  imports: [
    EditaisModule,
    UsersModule,
    MailModule,
    TypeOrmModule.forFeature([
      SyncRun,
      NotificationLog,
      Edital,
      PipelineAlertState,
    ]),
  ],
  controllers: [CaptacaoController],
  providers: [CaptacaoJobService, PipelineHealthAlertService],
  exports: [CaptacaoJobService, PipelineHealthAlertService],
})
export class CaptacaoModule {}
