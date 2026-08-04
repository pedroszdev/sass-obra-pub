import {
  elegibilidadeReembolso,
  REEMBOLSO_PRAZO_DIAS,
} from '../src/assinaturas/reembolso';

// Política de reembolso (T-218).
//
// 🔴 O prazo NÃO é escolha de produto: o art. 49 do CDC dá 7 dias de
// arrependimento em compra fora do estabelecimento, e o entendimento corrente é
// que alcança SaaS vendido pela internet. Aumentar é liberalidade; diminuir não
// é uma opção que exista.

const NOW = new Date('2026-08-04T12:00:00Z');
const emDias = (n: number) =>
  new Date(NOW.getTime() + n * 86_400_000).toISOString().slice(0, 10);

// ⚠️ `pagoEm` preenche as TRÊS datas de uma vez. O provedor manda até três, e
// um teste que mexesse em só uma testaria um payload que não existe — foi
// justamente confundi-las que gerou o bug de 04/08. O bloco "qual data marca o
// pagamento" é quem cobre a ausência de cada uma, com payload medido.
const paga = (
  over: Record<string, unknown> = {},
  pagoEm: string = emDias(-2),
) => ({
  id: 'pay_1',
  status: 'RECEIVED',
  billingType: 'CREDIT_CARD',
  paymentDate: pagoEm,
  clientPaymentDate: pagoEm,
  confirmedDate: pagoEm,
  value: 249,
  ...over,
});

describe('elegibilidadeReembolso', () => {
  it('o prazo é o do CDC', () => {
    expect(REEMBOLSO_PRAZO_DIAS).toBe(7);
  });

  it('pagamento recente → dentro do prazo, com a DATA em que ele acaba', () => {
    const e = elegibilidadeReembolso([paga()], NOW);
    expect(e.dentroDoPrazo).toBe(true);
    expect(e.pagamentoId).toBe('pay_1');
    // A tela precisa dizer a data, não "7 dias" — senão o cliente descobre o
    // prazo tarde demais.
    expect(e.prazoAte?.toISOString().slice(0, 10)).toBe(emDias(5));
  });

  it('passados os 7 dias, fora do prazo', () => {
    const e = elegibilidadeReembolso([paga({}, emDias(-8))], NOW);
    expect(e.dentroDoPrazo).toBe(false);
    // ⚠️ Segue elegível a PEDIR: fora do prazo vira decisão comercial do dono,
    // não uma porta fechada. Quem some é o direito automático, não o pedido.
    expect(e.pagamentoId).toBe('pay_1');
  });

  it('o prazo conta do PAGAMENTO, não do vencimento', () => {
    // Com a cobrança adiada (trial/reativação), vencimento e pagamento ficam
    // longe um do outro — contar do errado dá dias a mais ou a menos.
    const e = elegibilidadeReembolso([paga({}, emDias(-1))], NOW);
    expect(e.dentroDoPrazo).toBe(true);
  });

  it('usa a paga MAIS RECENTE', () => {
    const e = elegibilidadeReembolso(
      [
        paga({ id: 'antiga' }, emDias(-40)),
        paga({ id: 'recente' }, emDias(-1)),
      ],
      NOW,
    );
    expect(e.pagamentoId).toBe('recente');
    expect(e.dentroDoPrazo).toBe(true);
  });

  describe('o que a API do provedor consegue estornar', () => {
    // Medido na doc (04/08): cartão só integral, Pix total ou parcial, boleto
    // não consta. Prometer self-service para boleto seria prometer o que não
    // temos como executar — a devolução ali exige transferência manual.
    it('cartão e Pix são estornáveis', () => {
      for (const meio of ['CREDIT_CARD', 'PIX']) {
        expect(
          elegibilidadeReembolso([paga({ billingType: meio })], NOW)
            .estornavelPelaApi,
        ).toBe(true);
      }
    });

    it('boleto NÃO é estornável pela API', () => {
      expect(
        elegibilidadeReembolso([paga({ billingType: 'BOLETO' })], NOW)
          .estornavelPelaApi,
      ).toBe(false);
    });

    it('UNDEFINED pago não diz o meio → não promete estorno', () => {
      // `UNDEFINED` é "o pagador escolhe" (T-208); se o provedor não resolveu o
      // meio no retorno, não dá para afirmar que o estorno cabe.
      expect(
        elegibilidadeReembolso([paga({ billingType: 'UNDEFINED' })], NOW)
          .estornavelPelaApi,
      ).toBe(false);
    });
  });

  describe('sem base para reembolso', () => {
    it('nenhuma cobrança', () => {
      const e = elegibilidadeReembolso([], NOW);
      expect(e.pagamentoId).toBeNull();
      expect(e.dentroDoPrazo).toBe(false);
    });

    it('cobrança pendente não serve — não houve pagamento', () => {
      const e = elegibilidadeReembolso(
        [{ id: 'pay_1', status: 'PENDING', billingType: 'PIX', value: 249 }],
        NOW,
      );
      expect(e.pagamentoId).toBeNull();
    });

    it('paga sem data de pagamento é ignorada', () => {
      // Sem a data não há como contar o prazo, e chutar "hoje" daria 7 dias a
      // quem talvez não os tenha.
      const e = elegibilidadeReembolso(
        [{ id: 'pay_1', status: 'RECEIVED', billingType: 'PIX', value: 249 }],
        NOW,
      );
      expect(e.pagamentoId).toBeNull();
    });
  });

  // 🔴 REGRESSÃO real (04/08): o card de reembolso não aparecia para quem pagou
  // com CARTÃO. A regra lia `paymentDate`, que no cartão fica NULO enquanto o
  // status é CONFIRMED — só é preenchido no crédito, ~30 dias depois. Ou seja, o
  // reembolso ficava indisponível exatamente durante os 7 dias em que é direito.
  //
  // O payload abaixo é o MEDIDO no provedor, não inventado.
  describe('qual data marca o pagamento (medido no provedor)', () => {
    it('cartão CONFIRMED: paymentDate é nulo, vale o clientPaymentDate', () => {
      const e = elegibilidadeReembolso(
        [
          {
            id: 'pay_o3c5onyy8jycmt4e',
            status: 'CONFIRMED',
            billingType: 'CREDIT_CARD',
            paymentDate: undefined, // ← nulo no provedor
            clientPaymentDate: emDias(-1),
            confirmedDate: emDias(-1),
            value: 249,
          },
        ],
        NOW,
      );
      expect(e.pagamentoId).toBe('pay_o3c5onyy8jycmt4e');
      expect(e.dentroDoPrazo).toBe(true);
    });

    it('boleto RECEIVED: as três datas coincidem, e o resultado é o mesmo', () => {
      // No boleto o erro não aparecia — é o tipo de bug que passa num meio de
      // pagamento e some no outro.
      const e = elegibilidadeReembolso(
        [
          {
            id: 'pay_boleto',
            status: 'RECEIVED',
            billingType: 'BOLETO',
            paymentDate: emDias(-1),
            clientPaymentDate: emDias(-1),
            confirmedDate: emDias(-1),
            value: 249,
          },
        ],
        NOW,
      );
      expect(e.pagamentoId).toBe('pay_boleto');
      expect(e.dentroDoPrazo).toBe(true);
    });

    it('só confirmedDate ainda serve — fallback', () => {
      const e = elegibilidadeReembolso(
        [
          {
            id: 'pay_x',
            status: 'CONFIRMED',
            billingType: 'CREDIT_CARD',
            confirmedDate: emDias(-2),
            value: 249,
          },
        ],
        NOW,
      );
      expect(e.pagamentoId).toBe('pay_x');
    });
  });

  it('lê a data no fuso de Brasília, não no UTC do servidor', () => {
    // O servidor roda em UTC (§8). `2026-08-04` é meia-noite de Brasília =
    // 03:00Z; o prazo termina 7 dias depois disso.
    const e = elegibilidadeReembolso([paga({}, '2026-08-04')], NOW);
    expect(e.prazoAte?.toISOString()).toBe('2026-08-11T03:00:00.000Z');
  });
});
