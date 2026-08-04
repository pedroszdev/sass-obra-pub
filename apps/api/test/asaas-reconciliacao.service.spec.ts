import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { AsaasClient } from '../src/assinaturas/asaas-client';
import { AsaasReconciliacaoService } from '../src/assinaturas/asaas-reconciliacao.service';
import { Assinatura } from '../src/assinaturas/assinatura.entity';
import { AssinaturaStatus } from '../src/assinaturas/assinatura-status.enum';
import { PipelineAlertState } from '../src/captacao/pipeline-alert-state.entity';
import { MailService } from '../src/mail/mail.service';

// Rede de segurança do webhook do Asaas (T-223).
//
// 🔴 Ela não existia, e a falta doeu: em 03/08 uma assinatura ficou presa em
// TRIALING com a cobrança viva do outro lado, sem como destravar — a rotina da
// T-143 filtra por `stripeSubscriptionId`.

const NOW = new Date('2026-08-04T12:00:00Z');
const dias = (n: number) =>
  new Date(NOW.getTime() + n * 86_400_000).toISOString().slice(0, 10);

function build(
  opts: {
    assinatura?: Partial<Assinatura> | null;
    sub?: unknown;
    pagamentos?: unknown[];
    webhooks?: unknown[];
    alertaAnterior?: Date | null;
    semDestino?: boolean;
  } = {},
) {
  const get = jest.fn((caminho: string) => {
    if (caminho.startsWith('/webhooks')) {
      return Promise.resolve({ data: opts.webhooks ?? [{ enabled: true }] });
    }
    if (caminho.includes('/payments')) {
      return Promise.resolve({ data: opts.pagamentos ?? [] });
    }
    return Promise.resolve(
      opts.sub ?? { status: 'ACTIVE', cycle: 'MONTHLY', nextDueDate: dias(20) },
    );
  });
  const asaas = { get } as unknown as AsaasClient;

  const linha =
    opts.assinatura === null
      ? null
      : ({
          id: 'a1',
          userId: 'u1',
          status: AssinaturaStatus.TRIALING,
          plano: 'mensal',
          asaasSubscriptionId: 'sub_1',
          currentPeriodEnd: null,
          pastDueDesde: null,
          ...opts.assinatura,
        } as Assinatura);

  const update = jest.fn().mockResolvedValue({ affected: 1 });
  const assinaturas = {
    find: jest.fn().mockResolvedValue(linha ? [linha] : []),
    findOne: jest.fn().mockResolvedValue(linha),
    update,
  } as unknown as Repository<Assinatura>;

  const save = jest.fn().mockResolvedValue(undefined);
  const estadoAlerta = {
    findOne: jest
      .fn()
      .mockResolvedValue(
        opts.alertaAnterior
          ? { tipo: 't', lastSentAt: opts.alertaAnterior }
          : null,
      ),
    save,
  } as unknown as Repository<PipelineAlertState>;

  const sendMail = jest.fn().mockResolvedValue(undefined);
  const mail = { sendMail } as unknown as MailService;
  const config = {
    get: jest.fn(() => (opts.semDestino ? undefined : 'dono@x.com')),
  } as unknown as ConfigService;

  return {
    service: new AsaasReconciliacaoService(
      asaas,
      assinaturas,
      estadoAlerta,
      mail,
      config,
    ),
    update,
    sendMail,
    save,
    get,
  };
}

describe('AsaasReconciliacaoService.reconciliar', () => {
  // O caso concreto que motivou a task.
  it('destrava assinatura presa: cobrança pendente no futuro → active', async () => {
    const { service, update } = build({
      pagamentos: [{ status: 'PENDING', dueDate: dias(13) }],
    });

    const r = await service.reconciliar(NOW);

    expect(r.corrigidas).toBe(1);
    expect(update).toHaveBeenCalledWith(
      { id: 'a1' },
      expect.objectContaining({ status: AssinaturaStatus.ACTIVE }),
    );
  });

  it('nada divergiu → não escreve à toa', async () => {
    const { service, update } = build({
      assinatura: {
        status: AssinaturaStatus.ACTIVE,
        currentPeriodEnd: new Date(`${dias(20)}T03:00:00.000Z`),
      },
      pagamentos: [{ status: 'RECEIVED' }],
    });

    const r = await service.reconciliar(NOW);

    expect(r.corrigidas).toBe(0);
    expect(update).not.toHaveBeenCalled();
  });

  it('estado indeterminado → não mexe', async () => {
    // Assinatura recém-criada, sem cobrança ainda. "Não sei" nunca vira escrita.
    const { service, update } = build({ pagamentos: [] });
    expect((await service.reconciliar(NOW)).corrigidas).toBe(0);
    expect(update).not.toHaveBeenCalled();
  });

  it('past_due preserva o início da inadimplência', async () => {
    // A carência conta do PRIMEIRO vencimento; reiniciá-la daria acesso eterno.
    const desde = new Date('2026-08-01T00:00:00Z');
    const { service, update } = build({
      assinatura: { status: AssinaturaStatus.ACTIVE, pastDueDesde: desde },
      pagamentos: [{ status: 'OVERDUE' }],
    });

    await service.reconciliar(NOW);

    expect(update).toHaveBeenCalledWith(
      { id: 'a1' },
      expect.objectContaining({ pastDueDesde: desde }),
    );
  });

  it('cancelada não sobrescreve o fim do período', async () => {
    // Quem cancelou usa até o fim do que pagou (T-144) — a data é a do banco.
    const fim = new Date('2026-09-30T03:00:00Z');
    const { service, update } = build({
      assinatura: { status: AssinaturaStatus.ACTIVE, currentPeriodEnd: fim },
      sub: { status: 'INACTIVE', deleted: true, cycle: 'MONTHLY' },
    });

    await service.reconciliar(NOW);

    const patch = update.mock.calls[0][1] as Record<string, unknown>;
    expect(patch.status).toBe(AssinaturaStatus.CANCELED);
    expect(patch).not.toHaveProperty('currentPeriodEnd');
  });
});

describe('alertas (T-223)', () => {
  // 🔴 Toda divergência é um webhook que se perdeu — e webhook que se perde uma
  // vez se perde de novo. Corrigir em silêncio esconderia o problema de fundo.
  it('correção dispara alerta ao dono', async () => {
    const { service, sendMail } = build({
      pagamentos: [{ status: 'PENDING', dueDate: dias(13) }],
    });

    await service.reconciliar(NOW);

    expect(sendMail).toHaveBeenCalled();
    expect(sendMail.mock.calls[0][0].to).toBe('dono@x.com');
  });

  it('cooldown de 12h impede uma rodada ruim virar dez e-mails', async () => {
    const { service, sendMail } = build({
      pagamentos: [{ status: 'PENDING', dueDate: dias(13) }],
      alertaAnterior: new Date(NOW.getTime() - 3_600_000), // 1h atrás
    });

    await service.reconciliar(NOW);

    expect(sendMail).not.toHaveBeenCalled();
  });

  it('sem ADMIN_ALERT_EMAIL apenas loga — não derruba a reconciliação', async () => {
    const { service, sendMail, update } = build({
      pagamentos: [{ status: 'PENDING', dueDate: dias(13) }],
      semDestino: true,
    });

    const r = await service.reconciliar(NOW);

    expect(sendMail).not.toHaveBeenCalled();
    // O que de fato conserta segue acontecendo.
    expect(r.corrigidas).toBe(1);
    expect(update).toHaveBeenCalled();
  });

  // 🔴 A fila do Asaas PARA sozinha após falhas seguidas. O sintoma é a AUSÊNCIA
  // de eventos — nada acontece, e ninguém percebe até um cliente reclamar que
  // pagou e não foi liberado.
  it('fila interrompida gera alerta', async () => {
    const { service, sendMail } = build({
      webhooks: [
        {
          name: 'prod',
          enabled: true,
          interrupted: true,
          penalizedRequestsCount: 9,
        },
      ],
    });

    const r = await service.reconciliar(NOW);

    expect(r.filaMuda).toBe(true);
    expect(sendMail).toHaveBeenCalled();
    expect(String(sendMail.mock.calls[0][0].text)).toMatch(/INTERROMPIDO/);
  });

  it('webhook desabilitado também é fila muda', async () => {
    const { service } = build({ webhooks: [{ name: 'prod', enabled: false }] });
    expect((await service.reconciliar(NOW)).filaMuda).toBe(true);
  });

  it('fila saudável não alerta', async () => {
    const { service, sendMail } = build({
      webhooks: [{ name: 'prod', enabled: true, interrupted: false }],
      pagamentos: [{ status: 'RECEIVED' }],
      assinatura: {
        status: AssinaturaStatus.ACTIVE,
        currentPeriodEnd: new Date(`${dias(20)}T03:00:00.000Z`),
      },
    });

    const r = await service.reconciliar(NOW);

    expect(r.filaMuda).toBe(false);
    expect(sendMail).not.toHaveBeenCalled();
  });

  // Não conseguir LER a configuração não é o mesmo que a fila estar parada —
  // alertar aqui geraria falso positivo a cada instabilidade do provedor.
  it('falha ao ler os webhooks NÃO vira alerta de fila muda', async () => {
    const { service, sendMail, get } = build({
      pagamentos: [{ status: 'RECEIVED' }],
      assinatura: {
        status: AssinaturaStatus.ACTIVE,
        currentPeriodEnd: new Date(`${dias(20)}T03:00:00.000Z`),
      },
    });
    (get as jest.Mock).mockImplementation((caminho: string) => {
      if (caminho.startsWith('/webhooks')) {
        return Promise.reject(new Error('502'));
      }
      if (caminho.includes('/payments')) {
        return Promise.resolve({ data: [{ status: 'RECEIVED' }] });
      }
      return Promise.resolve({
        status: 'ACTIVE',
        cycle: 'MONTHLY',
        nextDueDate: dias(20),
      });
    });

    const r = await service.reconciliar(NOW);

    expect(r.filaMuda).toBe(false);
    expect(sendMail).not.toHaveBeenCalled();
  });
});

describe('reconciliarUsuario (replay do /admin)', () => {
  it('conta sem assinatura no Asaas devolve semAsaas', async () => {
    const { service } = build({ assinatura: { asaasSubscriptionId: null } });
    expect(await service.reconciliarUsuario('u1', NOW)).toEqual({
      corrigida: false,
      semAsaas: true,
    });
  });
});
