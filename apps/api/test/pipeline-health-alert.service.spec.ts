import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { Edital } from '../src/editais/edital.entity';
import { AlertaTeto, IaCustoService } from '../src/editais/ia-custo.service';
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
  alertasTeto?: AlertaTeto[];
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
  const iaCusto = {
    alertasDeTeto: jest.fn().mockResolvedValue(opts.alertasTeto ?? []),
  } as unknown as IaCustoService;
  const service = new PipelineHealthAlertService(
    syncRuns,
    notificacoes,
    editais,
    estado,
    mail as unknown as MailService,
    config,
    iaCusto,
  );
  return { service, mail, estado };
}

const teto = (
  periodo: 'diario' | 'mensal',
  nivel: 'aviso' | 'atingido',
  pct: number,
): AlertaTeto => ({ periodo, nivel, gasto: pct, teto: 1, pct });

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

  // Teto de custo de IA (T-190) — o alerta reusa o mesmo motor do pipeline.
  describe('teto de IA (T-190)', () => {
    it('teto diário atingido → e-mail de teto (IA pausada)', async () => {
      const { service, mail, estado } = build({
        ultimoSucesso: runOk(hAtras(2)),
        editaisNovos: 1,
        alertas: 1,
        alertasTeto: [teto('diario', 'atingido', 1.05)],
      });
      const r = await service.verificarEEnviar(NOW);
      expect(r.enviado).toBe(true);
      expect(r.problemas.some((p) => p.includes('ATINGIDO'))).toBe(true);
      expect(mail.sendMail).toHaveBeenCalledTimes(1);
      const arg = (mail.sendMail as jest.Mock).mock.calls[0][0];
      expect(arg.subject).toContain('teto de IA atingido');
      expect(estado.upsert).toHaveBeenCalledWith(
        { tipo: 'ia_teto_diario_atingido', lastSentAt: NOW },
        ['tipo'],
      );
    });

    it('aviso prévio (80%) → e-mail de aviso, não de pausa', async () => {
      const { service, mail } = build({
        ultimoSucesso: runOk(hAtras(2)),
        editaisNovos: 1,
        alertas: 1,
        alertasTeto: [teto('mensal', 'aviso', 0.85)],
      });
      const r = await service.verificarEEnviar(NOW);
      expect(r.enviado).toBe(true);
      const arg = (mail.sendMail as jest.Mock).mock.calls[0][0];
      expect(arg.subject).toContain('perto do teto');
      expect(arg.subject).not.toContain('atingido');
    });

    it('sem teto configurado (lista vazia) não alerta', async () => {
      const { service, mail } = build({
        ultimoSucesso: runOk(hAtras(2)),
        editaisNovos: 1,
        alertas: 1,
        alertasTeto: [],
      });
      const r = await service.verificarEEnviar(NOW);
      expect(r.enviado).toBe(false);
      expect(mail.sendMail).not.toHaveBeenCalled();
    });

    it('pipeline + teto juntos → dois e-mails (templates distintos)', async () => {
      const { service, mail } = build({
        ultimoSucesso: runOk(hAtras(50)), // pipeline parado
        alertasTeto: [teto('diario', 'atingido', 1.2)],
      });
      const r = await service.verificarEEnviar(NOW);
      expect(r.enviado).toBe(true);
      expect(mail.sendMail).toHaveBeenCalledTimes(2);
      const subjects = (mail.sendMail as jest.Mock).mock.calls.map(
        (c) => c[0].subject as string,
      );
      expect(subjects.some((s) => s.includes('pipeline com problema'))).toBe(
        true,
      );
      expect(subjects.some((s) => s.includes('teto de IA atingido'))).toBe(
        true,
      );
    });

    it('cooldown do teto suprime o reenvio', async () => {
      const { service, mail } = build({
        ultimoSucesso: runOk(hAtras(2)),
        editaisNovos: 1,
        alertas: 1,
        alertasTeto: [teto('diario', 'atingido', 1.1)],
        cooldownDe: hAtras(2).toISOString(), // enviado há 2h < 12h
      });
      const r = await service.verificarEEnviar(NOW);
      expect(r.enviado).toBe(false);
      expect(mail.sendMail).not.toHaveBeenCalled();
      expect(r.problemas.length).toBeGreaterThan(0);
    });
  });
});
