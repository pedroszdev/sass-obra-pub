import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  HealthIndicatorResult,
  HealthIndicatorService,
} from '@nestjs/terminus';
import { Repository } from 'typeorm';
import { SyncRun } from '../editais/sync/sync-run.entity';

// Saúde de DOMÍNIO, não de processo (T-106).
//
// O `/health` só perguntava "o servidor responde? o banco responde?". Os dois
// podem responder com a captação parada há uma semana — e aí o produto está
// morto (nenhuma obra nova entra) enquanto o monitoramento diz "ok". Servidor
// vivo não é pipeline viva.
//
// Aqui olhamos a última captação BEM-SUCEDIDA (`sync_runs`, T-19). Passou do
// prazo → `down`, e o monitor externo avisa. É a diferença entre descobrir que a
// captação parou pelo alerta ou pelo cliente reclamando que não vê obra nova.
//
// Estado DEGRADADO ≠ erro: um serviço novo, sem nenhuma captação ainda, não é
// falha — responde `ok` com `nunca: true`.

// Prazo tolerado sem captação bem-sucedida. O cron é diário; 48h dá margem para
// uma noite falhar (e, no free tier, para a hibernação atrapalhar) sem alarme falso.
const MAX_HORAS_SEM_CAPTACAO = 48;

@Injectable()
export class CaptacaoHealthIndicator {
  constructor(
    @InjectRepository(SyncRun)
    private readonly syncRuns: Repository<SyncRun>,
    private readonly indicador: HealthIndicatorService,
  ) {}

  async check(
    chave = 'captacao',
    now: Date = new Date(),
  ): Promise<HealthIndicatorResult> {
    const check = this.indicador.check(chave);

    const ultima = await this.syncRuns.findOne({
      where: { status: 'success' },
      order: { finishedAt: 'DESC' },
      select: { finishedAt: true },
    });

    // Nunca captou (serviço novo/banco recém-criado): não é falha.
    if (!ultima) {
      return check.up({ nunca: true });
    }

    const horas =
      (now.getTime() - new Date(ultima.finishedAt).getTime()) / 3_600_000;
    const detalhe = {
      ultimaCaptacao: ultima.finishedAt,
      horasAtras: Math.round(horas),
      limiteHoras: MAX_HORAS_SEM_CAPTACAO,
    };
    return horas > MAX_HORAS_SEM_CAPTACAO
      ? check.down(detalhe)
      : check.up(detalhe);
  }
}
