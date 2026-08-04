import { estadoDoAsaas, planoDoCiclo } from '../src/assinaturas/asaas-mapper';
import { AssinaturaStatus } from '../src/assinaturas/assinatura-status.enum';

// A regra que decide QUEM TEM ACESSO na reconciliação do Asaas (T-223).
//
// 🔴 Ela existe separada porque o Asaas é diferente da Stripe num ponto que muda
// tudo: lá `subscription.status` já carrega `past_due`; aqui a assinatura fica
// ACTIVE mesmo com cobrança vencida. O estado real só sai cruzando assinatura +
// cobranças — e errar aqui barra quem pagou ou libera quem não pagou.

const NOW = new Date('2026-08-04T12:00:00Z');
const dias = (n: number) =>
  new Date(NOW.getTime() + n * 86_400_000).toISOString().slice(0, 10);

const ativa = { status: 'ACTIVE', cycle: 'MONTHLY', nextDueDate: dias(20) };

describe('planoDoCiclo', () => {
  it('traduz os ciclos conhecidos', () => {
    expect(planoDoCiclo('MONTHLY')).toBe('mensal');
    expect(planoDoCiclo('YEARLY')).toBe('anual');
  });

  // Mesma decisão do stripe-mapper: recorrência desconhecida preserva o plano
  // local em vez de chutar um.
  it('ciclo desconhecido vira null, não um chute', () => {
    expect(planoDoCiclo('WEEKLY')).toBeNull();
    expect(planoDoCiclo(undefined)).toBeNull();
  });
});

describe('estadoDoAsaas', () => {
  it('sem assinatura → null (não mexe)', () => {
    expect(estadoDoAsaas(null, [], NOW)).toBeNull();
  });

  it('cobrança paga → active', () => {
    const e = estadoDoAsaas(ativa, [{ status: 'RECEIVED' }], NOW);
    expect(e?.status).toBe(AssinaturaStatus.ACTIVE);
    expect(e?.plano).toBe('mensal');
  });

  it('CONFIRMED também libera — não se espera o repasse', () => {
    // Esperar o dinheiro cair puniria o cliente por questão de tesouraria; é a
    // mesma decisão que o webhook (T-214) já tomou.
    expect(estadoDoAsaas(ativa, [{ status: 'CONFIRMED' }], NOW)?.status).toBe(
      AssinaturaStatus.ACTIVE,
    );
  });

  // 🔴 O degrau que NÃO existe no objeto da assinatura. Sem cruzar com as
  // cobranças, um inadimplente pareceria ativo para a reconciliação.
  it('cobrança vencida → past_due, mesmo com a assinatura ACTIVE', () => {
    const e = estadoDoAsaas(ativa, [{ status: 'OVERDUE' }], NOW);
    expect(e?.status).toBe(AssinaturaStatus.PAST_DUE);
  });

  it('vencida vence a paga antiga — o estado é o pior em aberto', () => {
    const e = estadoDoAsaas(
      ativa,
      [{ status: 'RECEIVED' }, { status: 'OVERDUE' }],
      NOW,
    );
    expect(e?.status).toBe(AssinaturaStatus.PAST_DUE);
  });

  describe('cancelamento', () => {
    it('deleted → canceled', () => {
      expect(estadoDoAsaas({ ...ativa, deleted: true }, [], NOW)?.status).toBe(
        AssinaturaStatus.CANCELED,
      );
    });

    // No Asaas o DELETE deixa DOIS sinais para o mesmo fato (medido na T-217).
    it('status INACTIVE também → canceled', () => {
      expect(
        estadoDoAsaas({ ...ativa, status: 'INACTIVE' }, [], NOW)?.status,
      ).toBe(AssinaturaStatus.CANCELED);
    });

    // ⚠️ Quem cancelou mantém o acesso até o fim do que pagou (T-144), e essa
    // data é a que JÁ está no nosso banco. Devolver o nextDueDate daqui a
    // sobrescreveria — e cortaria o acesso de quem pagou.
    it('cancelada NÃO devolve data — a do banco é que vale', () => {
      const e = estadoDoAsaas({ ...ativa, deleted: true }, [], NOW);
      expect(e?.currentPeriodEnd).toBeNull();
    });
  });

  // 🔴 O caso que deixou uma assinatura presa em TRIALING no dia 03/08: a
  // conversão de trial e a reativação adiam a 1ª cobrança, então existe uma
  // assinatura viva cuja única cobrança é PENDING no futuro. Tratar isso como
  // "não pagou" faria a reconciliação DESFAZER a marcação local.
  it('só cobrança pendente no FUTURO → active (trial convertido / reativação)', () => {
    const e = estadoDoAsaas(
      ativa,
      [{ status: 'PENDING', dueDate: dias(13) }],
      NOW,
    );
    expect(e?.status).toBe(AssinaturaStatus.ACTIVE);
  });

  it('pendente já vencida NÃO conta como ativa', () => {
    // Vencida de verdade é o OVERDUE; uma PENDING com data passada é estado
    // ambíguo do provedor, e ambiguidade não vira permissão.
    expect(
      estadoDoAsaas(ativa, [{ status: 'PENDING', dueDate: dias(-2) }], NOW),
    ).toBeNull();
  });

  it('sem cobrança nenhuma → null (assinatura recém-criada)', () => {
    expect(estadoDoAsaas(ativa, [], NOW)).toBeNull();
  });

  it('cobrança estornada é ignorada — o dinheiro voltou', () => {
    expect(estadoDoAsaas(ativa, [{ status: 'REFUNDED' }], NOW)).toBeNull();
  });

  it('devolve o vencimento como fim do período', () => {
    const e = estadoDoAsaas(ativa, [{ status: 'RECEIVED' }], NOW);
    expect(e?.currentPeriodEnd?.toISOString().slice(0, 10)).toBe(dias(20));
  });
});
