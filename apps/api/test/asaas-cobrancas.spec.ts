import {
  CobrancaPendente,
  podeReescreverCobrancas,
  primeiroVencimentoEmAberto,
} from '../src/assinaturas/asaas-cobrancas';

// Decisão de reescrever a cobrança em aberto na troca de plano.
//
// O caso que originou tudo está em `reativação → troca de plano`, no fim: é o
// bug que o dono achou em produção (cancelou mensal, reativou, trocou para
// anual, e a cobrança de setembro seguiu MENSAL).

// 3h de fuso: `2026-09-10` é meia-noite de Brasília = 03:00Z.
const AGORA = new Date('2026-08-03T12:00:00Z');

function cobranca(over: Partial<CobrancaPendente> = {}): CobrancaPendente {
  return {
    status: 'PENDING',
    billingType: 'CREDIT_CARD',
    dueDate: '2026-09-10',
    ...over,
  };
}

describe('podeReescreverCobrancas', () => {
  it('reescreve a cobrança de cartão pendente que vence no futuro', () => {
    expect(podeReescreverCobrancas([cobranca()], AGORA)).toBe(true);
  });

  it('não reescreve quando não há cobrança nenhuma', () => {
    // Flag seria inócuo, mas `true` faria a tela anunciar uma atualização que
    // não aconteceu.
    expect(podeReescreverCobrancas([], AGORA)).toBe(false);
  });

  it('não reescreve quando só há cobrança já liquidada', () => {
    expect(
      podeReescreverCobrancas([cobranca({ status: 'RECEIVED' })], AGORA),
    ).toBe(false);
  });

  it('cobrança liquidada não bloqueia a pendente de cartão', () => {
    // Senão o flag nunca mais seria `true` depois do 1º pagamento.
    expect(
      podeReescreverCobrancas(
        [cobranca({ status: 'CONFIRMED', dueDate: '2026-07-10' }), cobranca()],
        AGORA,
      ),
    ).toBe(true);
  });

  describe('o que BLOQUEIA a reescrita', () => {
    it('boleto/Pix — o cliente pode já ter o documento na mão', () => {
      for (const billingType of ['BOLETO', 'PIX', 'UNDEFINED']) {
        expect(
          podeReescreverCobrancas([cobranca({ billingType })], AGORA),
        ).toBe(false);
      }
    });

    it('OVERDUE — não é PENDING, e o flag a reescreveria assim mesmo', () => {
      expect(
        podeReescreverCobrancas([cobranca({ status: 'OVERDUE' })], AGORA),
      ).toBe(false);
    });

    it('status desconhecido do provedor cai no lado seguro', () => {
      expect(
        podeReescreverCobrancas([cobranca({ status: 'STATUS_NOVO' })], AGORA),
      ).toBe(false);
    });

    it('cobrança vencendo hoje — pode estar sendo paga neste minuto', () => {
      // 03/08 em Brasília é o mesmo dia de AGORA.
      expect(
        podeReescreverCobrancas([cobranca({ dueDate: '2026-08-03' })], AGORA),
      ).toBe(false);
    });

    it('cobrança já vencida', () => {
      expect(
        podeReescreverCobrancas([cobranca({ dueDate: '2026-07-10' })], AGORA),
      ).toBe(false);
    });

    it('data ilegível', () => {
      expect(
        podeReescreverCobrancas([cobranca({ dueDate: 'ontem' })], AGORA),
      ).toBe(false);
      expect(
        podeReescreverCobrancas([cobranca({ dueDate: undefined })], AGORA),
      ).toBe(false);
    });

    it('UMA intocável derruba o conjunto — o flag é da assinatura inteira', () => {
      expect(
        podeReescreverCobrancas(
          [cobranca(), cobranca({ billingType: 'BOLETO' })],
          AGORA,
        ),
      ).toBe(false);
    });
  });

  it('respeita o calendário de Brasília, não o UTC do servidor', () => {
    // 04/08 vence às 03:00Z. Aos 23:00Z de 03/08 ainda é dia 3 em Brasília, e a
    // cobrança é futura — em UTC puro a conta daria "já passou".
    const noiteUtc = new Date('2026-08-03T23:00:00Z');
    expect(
      podeReescreverCobrancas([cobranca({ dueDate: '2026-08-04' })], noiteUtc),
    ).toBe(true);
  });
});

describe('primeiroVencimentoEmAberto', () => {
  it('devolve a mais próxima entre as em aberto', () => {
    const d = primeiroVencimentoEmAberto([
      cobranca({ dueDate: '2026-10-10' }),
      cobranca({ dueDate: '2026-09-10' }),
    ]);
    expect(d?.toISOString()).toBe('2026-09-10T03:00:00.000Z');
  });

  it('ignora as já liquidadas', () => {
    const d = primeiroVencimentoEmAberto([
      cobranca({ status: 'RECEIVED', dueDate: '2026-07-10' }),
      cobranca({ dueDate: '2026-09-10' }),
    ]);
    expect(d?.toISOString()).toBe('2026-09-10T03:00:00.000Z');
  });

  it('sem cobrança em aberto → null', () => {
    expect(primeiroVencimentoEmAberto([])).toBeNull();
  });
});

describe('reativação → troca de plano (o bug de produção)', () => {
  it('a cobrança adiada da reativação é reescrita para o plano novo', () => {
    // Cancelou o mensal com acesso pago até setembro, reativou: a 1ª cobrança
    // nasce vencendo em setembro (`primeiroVencimento`), no cartão, e ninguém
    // pode pagá-la adiantado. Trocar para anual DEVE alcançá-la — antes ela
    // ficava no valor mensal e o anual só valia em outubro.
    const reativada = [
      cobranca({
        status: 'PENDING',
        billingType: 'CREDIT_CARD',
        dueDate: '2026-09-09',
      }),
    ];
    expect(podeReescreverCobrancas(reativada, AGORA)).toBe(true);
    expect(primeiroVencimentoEmAberto(reativada)?.toISOString()).toBe(
      '2026-09-09T03:00:00.000Z',
    );
  });

  it('mas não alcança a reativação por boleto/Pix', () => {
    // Aí o `invoiceUrl` está vivo desde o início e o pagador pode ter o
    // documento aberto: vale a regra antiga, troca só no ciclo seguinte.
    const reativada = [
      cobranca({ billingType: 'UNDEFINED', dueDate: '2026-09-09' }),
    ];
    expect(podeReescreverCobrancas(reativada, AGORA)).toBe(false);
  });
});
