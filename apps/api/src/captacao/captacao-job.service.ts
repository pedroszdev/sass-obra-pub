import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { UfCaptureService } from '../editais/uf-capture.service';
import { UsersService } from '../users/users.service';

// Maestro da captação agendada. Lê as UFs dos usuários ativos e delega a captura
// de cada uma ao UfCaptureService (que faz backfill/incremental, ingere e
// atualiza o controle de sync). O mesmo service alimenta a captação sob demanda
// pela busca (T-34); aqui o gatilho é o cron / disparo manual.
@Injectable()
export class CaptacaoJobService {
  private readonly logger = new Logger(CaptacaoJobService.name);

  constructor(
    private readonly capture: UfCaptureService,
    private readonly users: UsersService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async scheduledSync(): Promise<void> {
    await this.runOnce();
  }

  // Um ciclo completo de captação. Público para permitir disparo manual (ops).
  async runOnce(): Promise<void> {
    const ufs = await this.users.findDistinctUfs();
    if (ufs.length === 0) {
      this.logger.log('Nenhuma UF ativa (sem usuários com UF). Nada a captar.');
      return;
    }
    this.logger.log(`Captação iniciada: ${ufs.length} UF(s).`);
    for (const uf of ufs) {
      await this.capture.captureUf(uf);
    }
    this.logger.log('Captação finalizada.');
  }
}
