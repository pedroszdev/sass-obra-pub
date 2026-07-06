import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ExigenciasService } from '../editais/exigencias/exigencias.service';
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
    private readonly exigencias: ExigenciasService,
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
      // Isola cada UF (T-118b): uma UF que falhe não pode pular as demais da noite.
      try {
        await this.capture.captureUf(uf);
      } catch (caught) {
        const message =
          caught instanceof Error ? caught.message : String(caught);
        this.logger.error(
          `Captação de ${uf} falhou (segue as demais): ${message}`,
        );
      }
      // Pré-computa resumo + exigências dos editais novos da UF (T-54). SÓ aqui
      // (job agendado + disparo manual), NÃO na captação sob demanda da busca —
      // pra não gastar IA a cada busca. Fire-and-forget, bounded, dedup por UF.
      // O .catch é obrigatório (T-118b): sem ele uma unhandled rejection do
      // fire-and-forget pode derrubar o processo inteiro.
      void this.exigencias.triggerPrecomputeUf(uf).catch((caught: unknown) => {
        const message =
          caught instanceof Error ? caught.message : String(caught);
        this.logger.warn(`Pré-computação de ${uf} falhou: ${message}`);
      });
    }
    this.logger.log('Captação finalizada.');
  }
}
