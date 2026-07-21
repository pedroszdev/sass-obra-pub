import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { Edital } from '../src/editais/edital.entity';
import { MailService } from '../src/mail/mail.service';
import { NotificationLog } from '../src/notificacoes/notification-log.entity';
import { PipelineAlertState } from '../src/captacao/pipeline-alert-state.entity';
import { PipelineHealthAlertService } from '../src/captacao/pipeline-health-alert.service';
import { SyncRun } from '../src/editais/sync/sync-run.entity';

// Rede de segurança do pipeline (T-189): se ela deixar de avisar, uma captação
// parada passa dias despercebida; se avisar demais, vira spam. Os testes travam
// as condições, o cooldown e o "sem destinatário".

const NOW = new Date('2026-07-14T12:00:00Z');
const hAtras = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

function build(opts: {
  totalRuns?: number;
  ultimoSucesso?: SyncRun | null;
  ultimasPorFonte?: Partial<SyncRun>[];
  editaisNovos?: number;
  alertas?: number;
  cooldownDe?: string | null;
  email?: string;
}) {
  const syncRuns = {
    count: jest.fn().mockResolvedValue(opts.totalRuns ?? 5),
    findOne: jest.fn().mockResolvedValue(opts.ultimoSucesso ?? null),
    find: jest.fn().mockResolvedValue(opts.ultimasPorFonte ?? []),
  } as unknown as Repository<SyncRun>;
  const notificacoes = {
    count: jest.fn().mockResolvedValue(opts.alertas ?? 1),
  } as unknown as Repository<NotificationLog>;
  const editais = {
    count: jest.fn().mockResolvedValue(opts.editaisNovos ?? 0),
  } as unknown as Repository<Edital>;
  const estado = {
    findOne: jest
      .fn()
      .mockResolvedValue(
        opts.cooldownDe
          ? { tipo: 't', lastSentAt: new Date(opts.cooldownDe) }
          : null,
      ),
    upsert: jest.fn().mockResolvedValue(undefined),
  } as unknown as Repository<PipelineAlertState>;
  const mail = { sendMail: jest.fn().mockResolvedValue(undefined) };
  const config = {
    get: jest.fn().mockReturnValue(opts.email ?? 'dono@empresa.com'),
  } as unknown as ConfigService;
  const service = new PipelineHealthAlertService(
    syncRuns,
    notificacoes,
    editais,
    estado,
    mail as unknown as MailService,
    config,
  );
  return { service, mail, estado };
}

const runOk = (finishedAt: Date): SyncRun =>
  ({ status: 'success', finishedAt }) as SyncRun;
const runErr = (): Partial<SyncRun> => ({ status: 'error', startedAt: NOW });

describe('PipelineHealthAlertService (T-189)', () => {
  it('tudo saudável: não envia nada', async () => {
    const { service, mail } = build({
      ultimoSucesso: runOk(hAtras(2)),
      editaisNovos: 3,
      alertas: 2,
    });
    const r = await service.verificarEEnviar(NOW);
    expect(r.enviado).toBe(false);
    expect(r.problemas).toEqual([]);
    expect(mail.sendMail).not.toHaveBeenCalled();
  });

  it('captação parada (>48h sem sucesso) → alerta', async () => {
    const { service, mail } = build({ ultimoSucesso: runOk(hAtras(50)) });
    const r = await service.verificarEEnviar(NOW);
    expect(r.enviado).toBe(true);
    expect(r.problemas[0]).toContain('sem sucesso');
    expect(mail.sendMail).toHaveBeenCalledTimes(1);
  });

  it('banco novo (zero execuções) NÃO alerta parada', async () => {
    const { service, mail } = build({ totalRuns: 0, ultimoSucesso: null });
    const r = await service.verificarEEnviar(NOW);
    expect(r.problemas).toEqual([]);
    expect(mail.sendMail).not.toHaveBeenCalled();
  });

  it('conector com 3 erros seguidos → alerta', async () => {
    const { service, mail } = build({
      ultimoSucesso: runOk(hAtras(2)),
      ultimasPorFonte: [runErr(), runErr(), runErr()],
      editaisNovos: 1,
      alertas: 1,
    });
    const r = await service.verificarEEnviar(NOW);
    expect(r.enviado).toBe(true);
    expect(
      r.problemas.some((p) => p.includes('execuções seguidas com erro')),
    ).toBe(true);
    expect(mail.sendMail).toHaveBeenCalledTimes(1);
  });

  it('captou mas não alertou (editais>0, alertas=0) → alerta', async () => {
    const { service } = build({
      ultimoSucesso: runOk(hAtras(2)),
      editaisNovos: 10,
      alertas: 0,
    });
    const r = await service.verificarEEnviar(NOW);
    expect(r.enviado).toBe(true);
    expect(r.problemas.some((p) => p.includes('0 alertas enviados'))).toBe(
      true,
    );
  });

  it('cooldown ativo suprime o reenvio', async () => {
    const { service, mail } = build({
      ultimoSucesso: runOk(hAtras(50)),
      cooldownDe: hAtras(2).toISOString(), // enviado há 2h < 12h
    });
    const r = await service.verificarEEnviar(NOW);
    expect(r.enviado).toBe(false);
    expect(mail.sendMail).not.toHaveBeenCalled();
    // ainda REPORTA o problema detectado (só não reenvia)
    expect(r.problemas.length).toBeGreaterThan(0);
  });

  it('sem ADMIN_ALERT_EMAIL: não envia nem marca cooldown, mas detecta', async () => {
    const { service, mail, estado } = build({
      ultimoSucesso: runOk(hAtras(50)),
      email: '',
    });
    const r = await service.verificarEEnviar(NOW);
    expect(r.enviado).toBe(false);
    expect(r.problemas.length).toBeGreaterThan(0);
    expect(mail.sendMail).not.toHaveBeenCalled();
    expect(estado.upsert).not.toHaveBeenCalled();
  });

  it('ao enviar, marca o cooldown do tipo', async () => {
    const { service, estado } = build({ ultimoSucesso: runOk(hAtras(50)) });
    await service.verificarEEnviar(NOW);
    expect(estado.upsert).toHaveBeenCalledWith(
      { tipo: 'captacao_parada', lastSentAt: NOW },
      ['tipo'],
    );
  });
});
