import { HealthIndicatorService } from '@nestjs/terminus';
import { Repository } from 'typeorm';
import { CaptacaoHealthIndicator } from '../src/health/captacao.health';
import { SyncRun } from '../src/editais/sync/sync-run.entity';

// Saúde de DOMÍNIO (T-106): o /health comum responde "ok" com a captação parada
// há uma semana — servidor vivo não é pipeline viva. Aqui olhamos a última
// captação bem-sucedida.
function build(ultima: { finishedAt: Date } | null) {
  const syncRuns = {
    findOne: jest.fn().mockResolvedValue(ultima),
  } as unknown as Repository<SyncRun>;
  // Forma mínima do HealthIndicatorService (up/down por chave).
  const indicador = {
    check: (chave: string) => ({
      up: (d: unknown) => ({ [chave]: { status: 'up', ...(d as object) } }),
      down: (d: unknown) => ({ [chave]: { status: 'down', ...(d as object) } }),
    }),
  } as unknown as HealthIndicatorService;
  return new CaptacaoHealthIndicator(syncRuns, indicador);
}

const NOW = new Date('2026-07-14T12:00:00Z');

describe('CaptacaoHealthIndicator (T-106)', () => {
  it('up quando a última captação é recente', async () => {
    const service = build({ finishedAt: new Date('2026-07-14T03:00:00Z') });

    const r = await service.check('captacao', NOW);

    expect(r.captacao.status).toBe('up');
    expect(r.captacao.horasAtras).toBe(9);
  });

  // É AQUI que o alerta nasce: o servidor responde, o banco responde, e mesmo
  // assim nenhuma obra nova entra há dias.
  it('down quando passou do limite sem captação bem-sucedida', async () => {
    const service = build({ finishedAt: new Date('2026-07-11T00:00:00Z') }); // 84h

    const r = await service.check('captacao', NOW);

    expect(r.captacao.status).toBe('down');
    expect(r.captacao.horasAtras).toBe(84);
  });

  // Serviço novo, banco recém-criado: ainda não captou nada. Não é falha.
  it('up (nunca captou) quando não há sync bem-sucedida', async () => {
    const service = build(null);

    const r = await service.check('captacao', NOW);

    expect(r.captacao.status).toBe('up');
    expect(r.captacao.nunca).toBe(true);
  });
});
