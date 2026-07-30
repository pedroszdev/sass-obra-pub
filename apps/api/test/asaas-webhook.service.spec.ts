import { Repository } from 'typeorm';
import { AsaasClient } from '../src/assinaturas/asaas-client';
import { AsaasEvent } from '../src/assinaturas/asaas-event.entity';
import {
  AsaasWebhookService,
  dataAsaas,
  EventoAsaas,
} from '../src/assinaturas/asaas-webhook.service';
import { Assinatura } from '../src/assinaturas/assinatura.entity';
import { AssinaturaStatus } from '../src/assinaturas/assinatura-status.enum';

// T-214 — o webhook é o ÚNICO lugar que libera acesso. Estes testes guardam as
// três armadilhas que a T-209 mediu no Asaas: entrega "at least once", ausência
// de garantia de ordem, e uma fila que PARA depois de falhas seguidas.

const ASSINATURA = {
  id: 'a1',
  asaasSubscriptionId: 'sub_1',
  asaasCustomerId: 'cus_1',
  pastDueDesde: null,
  currentPeriodEnd: null,
  asaasAtualizadoEm: null,
} as unknown as Assinatura;

function evento(over: Partial<EventoAsaas> = {}): EventoAsaas {
  return {
    id: 'evt_1',
    event: 'PAYMENT_CONFIRMED',
    dateCreated: '2026-07-30 10:00:00',
    payment: { id: 'pay_1', customer: 'cus_1', subscription: 'sub_1' },
    ...over,
  };
}

describe('AsaasWebhookService (T-214)', () => {
  let assinaturas: { findOne: jest.Mock; update: jest.Mock };
  let eventos: { createQueryBuilder: jest.Mock; delete: jest.Mock };
  let client: { get: jest.Mock };
  let service: AsaasWebhookService;
  let inseriu: boolean;

  beforeEach(() => {
    inseriu = true;
    assinaturas = {
      findOne: jest.fn().mockResolvedValue({ ...ASSINATURA }),
      update: jest.fn().mockResolvedValue(undefined),
    };
    eventos = {
      createQueryBuilder: jest.fn(() => ({
        insert: () => ({
          values: () => ({
            orIgnore: () => ({
              execute: () =>
                Promise.resolve({ raw: inseriu ? [{ id: 'evt_1' }] : [] }),
            }),
          }),
        }),
      })),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    client = {
      get: jest.fn().mockResolvedValue({ nextDueDate: '2026-08-30' }),
    };
    service = new AsaasWebhookService(
      client as unknown as AsaasClient,
      assinaturas as unknown as Repository<Assinatura>,
      eventos as unknown as Repository<AsaasEvent>,
    );
  });

  it('pagamento confirmado ativa a assinatura e zera a carência', async () => {
    const r = await service.processar(evento());

    expect(r.aplicado).toBe(true);
    expect(assinaturas.update).toHaveBeenCalledWith(
      { id: 'a1' },
      expect.objectContaining({
        status: AssinaturaStatus.ACTIVE,
        provider: 'asaas',
        pastDueDesde: null,
      }),
    );
  });

  it('PAYMENT_RECEIVED também libera — não esperamos o repasse cair', async () => {
    // CONFIRMED = pagou; RECEIVED = o dinheiro caiu na conta. Fazer o cliente
    // esperar a tesouraria do provedor seria puni-lo por algo que não é dele.
    const r = await service.processar(evento({ event: 'PAYMENT_RECEIVED' }));
    expect(r.aplicado).toBe(true);
  });

  it('evento REPETIDO não aplica efeito duas vezes (entrega "at least once")', async () => {
    inseriu = false; // a PK já existia

    const r = await service.processar(evento());

    expect(r).toEqual({ aplicado: false, motivo: 'evento repetido' });
    expect(assinaturas.update).not.toHaveBeenCalled();
  });

  it('evento ATRASADO não sobrescreve estado mais novo', async () => {
    // Sem esta guarda, um OVERDUE que ficou preso na fila chegaria depois do
    // CONFIRMED e bloquearia quem acabou de pagar.
    // ⚠️ 09:00 de BRASÍLIA são 12:00Z. O estado precisa ser mais novo que isso
    // para a guarda disparar — este teste só passa porque `dataAsaas` converte
    // o fuso; com o parser ingênuo os dois instantes empatavam.
    assinaturas.findOne.mockResolvedValue({
      ...ASSINATURA,
      asaasAtualizadoEm: new Date('2026-07-30T15:00:00Z'),
    });

    const r = await service.processar(
      evento({ event: 'PAYMENT_OVERDUE', dateCreated: '2026-07-30 09:00:00' }),
    );

    expect(r.motivo).toBe('evento mais antigo que o estado');
    expect(assinaturas.update).not.toHaveBeenCalled();
  });

  it('vencido vira past_due e PRESERVA o início da inadimplência', async () => {
    // A carência (T-130) conta do PRIMEIRO vencimento. Sobrescrever a cada
    // evento a reiniciaria, e o inadimplente ficaria com acesso para sempre.
    const primeiro = new Date('2026-07-01T00:00:00Z');
    assinaturas.findOne.mockResolvedValue({
      ...ASSINATURA,
      pastDueDesde: primeiro,
    });

    await service.processar(evento({ event: 'PAYMENT_OVERDUE' }));

    expect(assinaturas.update).toHaveBeenCalledWith(
      { id: 'a1' },
      expect.objectContaining({
        status: AssinaturaStatus.PAST_DUE,
        pastDueDesde: primeiro,
      }),
    );
  });

  it('reembolso INTEGRAL corta o acesso', async () => {
    await service.processar(evento({ event: 'PAYMENT_REFUNDED' }));

    expect(assinaturas.update).toHaveBeenCalledWith(
      { id: 'a1' },
      expect.objectContaining({
        status: AssinaturaStatus.CANCELED,
        reembolsadaEm: expect.any(Date),
      }),
    );
  });

  it('reembolso PARCIAL NÃO corta — devolver parte não desfaz a assinatura', async () => {
    // Regra do projeto (T-157). Está em teste porque é uma decisão de negócio
    // que o nome do evento sozinho não revela.
    const r = await service.processar(
      evento({ event: 'PAYMENT_PARTIALLY_REFUNDED' }),
    );

    expect(r).toEqual({ aplicado: false, motivo: 'tipo ignorado' });
    expect(assinaturas.update).not.toHaveBeenCalled();
  });

  it('estende o período com o nextDueDate lido da assinatura', async () => {
    await service.processar(evento());

    expect(client.get).toHaveBeenCalledWith('/subscriptions/sub_1');
    const patch = assinaturas.update.mock.calls[0][1] as {
      currentPeriodEnd: Date;
    };
    expect(patch.currentPeriodEnd.toISOString()).toContain('2026-08-30');
  });

  it('se a leitura do período falhar, o pagamento AINDA é registrado', async () => {
    // Melhor um fim de período desatualizado do que perder a confirmação — sem
    // isto, uma instabilidade do provedor deixaria quem pagou fora do produto.
    client.get.mockRejectedValue(new Error('rede caiu'));

    const r = await service.processar(evento());

    expect(r.aplicado).toBe(true);
    expect(assinaturas.update).toHaveBeenCalledWith(
      { id: 'a1' },
      expect.objectContaining({ status: AssinaturaStatus.ACTIVE }),
    );
  });

  it('evento de outra conta (sem assinatura nossa) é ignorado sem erro', async () => {
    // O Asaas manda eventos de TODA a conta, e o dono pode cobrar alguém pelo
    // painel. Lançar aqui faria o provedor reentregar para sempre — e a fila
    // dele PARA depois de falhas seguidas.
    assinaturas.findOne.mockResolvedValue(null);

    const r = await service.processar(evento());

    expect(r).toEqual({
      aplicado: false,
      motivo: 'assinatura não encontrada',
    });
  });

  it('evento sem id não é processado (não há como deduplicar)', async () => {
    const r = await service.processar({ event: 'PAYMENT_CONFIRMED' });
    expect(r.motivo).toBe('evento malformado');
  });

  it('falha ao aplicar REMOVE o registro, para a reentrega tentar de novo', async () => {
    assinaturas.update.mockRejectedValue(new Error('banco caiu'));

    await expect(service.processar(evento())).rejects.toThrow('banco caiu');
    expect(eventos.delete).toHaveBeenCalledWith({ id: 'evt_1' });
  });

  it('busca por assinatura ANTES de por cliente', async () => {
    // Buscar por cliente primeiro casaria a cobrança errada em quem teve mais de
    // uma assinatura ao longo do tempo.
    await service.processar(evento());

    expect(assinaturas.findOne).toHaveBeenNthCalledWith(1, {
      where: { asaasSubscriptionId: 'sub_1' },
    });
  });
});

describe('dataAsaas — o fuso que o Asaas não manda (T-214)', () => {
  // 🔴 Bug real pego por este teste: o Asaas manda "2026-07-30 10:00:00" sem
  // fuso, em horário de Brasília, e o servidor roda em UTC. O parser ingênuo
  // (`new Date(texto.replace(' ','T'))`) lia como hora local do servidor e
  // errava por 3 horas — o suficiente para a guarda de ordem descartar um
  // pagamento legítimo e deixar quem pagou sem acesso.
  it('interpreta o horário como Brasília (-03:00), não como o fuso do servidor', () => {
    expect(dataAsaas('2026-07-30 10:00:00')!.toISOString()).toBe(
      '2026-07-30T13:00:00.000Z',
    );
  });

  it('data pura vira meia-noite de Brasília', () => {
    expect(dataAsaas('2026-08-30')!.toISOString()).toBe(
      '2026-08-30T03:00:00.000Z',
    );
  });

  it('ausente ou inválida vira null, sem lançar', () => {
    expect(dataAsaas(undefined)).toBeNull();
    expect(dataAsaas('nao é data')).toBeNull();
  });
});
