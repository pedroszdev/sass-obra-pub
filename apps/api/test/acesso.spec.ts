import {
  calcularAcesso,
  fimDoAcesso,
  PAST_DUE_CARENCIA_DIAS,
  trialTermina,
  TRIAL_DIAS,
} from '../src/assinaturas/acesso';
import { AssinaturaStatus } from '../src/assinaturas/assinatura-status.enum';

// O "pode usar?" do produto (T-127). Função PURA com `now` injetável (§3.3): é o
// backend que decide, o front só renderiza. É esta função que o paywall (T-130)
// vai consumir — se ela errar, ou o cliente pagante é barrado, ou o produto vira
// de graça.

const NOW = new Date('2026-07-14T12:00:00Z');
const dias = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

describe('trialTermina', () => {
  it('são 7 dias (decisão do dono)', () => {
    expect(TRIAL_DIAS).toBe(7);
    expect(trialTermina(NOW)).toEqual(new Date('2026-07-21T12:00:00Z'));
  });
});

describe('calcularAcesso (T-127)', () => {
  it('trial válido → libera e conta os dias restantes', () => {
    const a = calcularAcesso(
      {
        status: AssinaturaStatus.TRIALING,
        trialEndsAt: dias(5),
        currentPeriodEnd: null,
      },
      NOW,
    );

    expect(a.permitido).toBe(true);
    expect(a.emTrial).toBe(true);
    expect(a.diasRestantesTrial).toBe(5);
  });

  // Arredonda para CIMA: quem ainda tem 6 horas de acesso não pode ler "0 dias".
  it('trial acabando em horas ainda conta como 1 dia', () => {
    const a = calcularAcesso(
      {
        status: AssinaturaStatus.TRIALING,
        trialEndsAt: new Date('2026-07-14T18:00:00Z'),
        currentPeriodEnd: null,
      },
      NOW,
    );

    expect(a.permitido).toBe(true);
    expect(a.diasRestantesTrial).toBe(1);
  });

  it('trial expirado → bloqueia, com motivo', () => {
    const a = calcularAcesso(
      {
        status: AssinaturaStatus.TRIALING,
        trialEndsAt: dias(-1),
        currentPeriodEnd: null,
      },
      NOW,
    );

    expect(a.permitido).toBe(false);
    expect(a.motivo).toBe('trial_expirado');
    expect(a.diasRestantesTrial).toBe(0);
  });

  it('assinatura ativa → libera', () => {
    const a = calcularAcesso(
      {
        status: AssinaturaStatus.ACTIVE,
        trialEndsAt: dias(-30),
        currentPeriodEnd: dias(20),
      },
      NOW,
    );

    expect(a.permitido).toBe(true);
    expect(a.emTrial).toBe(false);
  });

  // Cartão recusado uma vez não pode custar o produto: a Stripe ainda está
  // retentando, e a carência segura o acesso enquanto isso.
  it('past_due dentro da carência → ainda libera', () => {
    const a = calcularAcesso(
      {
        status: AssinaturaStatus.PAST_DUE,
        trialEndsAt: null,
        currentPeriodEnd: dias(10),
        pastDueDesde: dias(-1),
      },
      NOW,
    );

    expect(a.permitido).toBe(true);
  });

  it('past_due além da carência → bloqueia', () => {
    const a = calcularAcesso(
      {
        status: AssinaturaStatus.PAST_DUE,
        trialEndsAt: null,
        currentPeriodEnd: dias(10),
        pastDueDesde: dias(-(PAST_DUE_CARENCIA_DIAS + 1)),
      },
      NOW,
    );

    expect(a.permitido).toBe(false);
    expect(a.motivo).toBe('sem_pagamento');
  });

  // Cancelar não corta na hora: cobrar o mês e entregar meio seria roubo (T-144).
  it('cancelada com período pago em aberto → mantém o acesso até o fim', () => {
    const a = calcularAcesso(
      {
        status: AssinaturaStatus.CANCELED,
        trialEndsAt: null,
        currentPeriodEnd: dias(12),
      },
      NOW,
    );

    expect(a.permitido).toBe(true);
  });

  it('cancelada com o período já vencido → bloqueia', () => {
    const a = calcularAcesso(
      {
        status: AssinaturaStatus.CANCELED,
        trialEndsAt: null,
        currentPeriodEnd: dias(-1),
      },
      NOW,
    );

    expect(a.permitido).toBe(false);
    expect(a.motivo).toBe('cancelada');
  });

  // Não deveria existir (o cadastro cria e a migration fez backfill). Se existir,
  // é bug nosso — mas a função não pode explodir nem liberar tudo por omissão.
  it('sem assinatura → bloqueia, sem quebrar', () => {
    const a = calcularAcesso(null, NOW);

    expect(a.permitido).toBe(false);
    expect(a.motivo).toBe('sem_pagamento');
  });
});

// O reembolso é o caso em que a generosidade da T-144 tem que ser desligada:
// "cancelou mas pagou, usa até o fim" vira errado quando o dinheiro voltou.
describe('calcularAcesso — reembolso (T-157)', () => {
  it('reembolsada corta o acesso mesmo com a Stripe dizendo `active`', () => {
    // Reembolsar NÃO cancela na Stripe: sem esta regra, a pessoa ficaria com o
    // dinheiro de volta E com o produto.
    const a = calcularAcesso(
      {
        status: AssinaturaStatus.ACTIVE,
        trialEndsAt: null,
        currentPeriodEnd: dias(20),
        reembolsadaEm: dias(-1),
      },
      NOW,
    );

    expect(a.permitido).toBe(false);
    expect(a.motivo).toBe('reembolsada');
  });

  it('reembolsada corta mesmo com período pago em aberto', () => {
    // A regra da T-144 liberaria aqui (canceled + currentPeriodEnd no futuro).
    // O reembolso precede: não há período pago a honrar.
    const a = calcularAcesso(
      {
        status: AssinaturaStatus.CANCELED,
        trialEndsAt: null,
        currentPeriodEnd: dias(20),
        reembolsadaEm: dias(-1),
      },
      NOW,
    );

    expect(a.permitido).toBe(false);
    expect(a.motivo).toBe('reembolsada');
  });

  it('reembolsada corta mesmo no meio do trial', () => {
    const a = calcularAcesso(
      {
        status: AssinaturaStatus.TRIALING,
        trialEndsAt: dias(5),
        currentPeriodEnd: null,
        reembolsadaEm: dias(-1),
      },
      NOW,
    );

    expect(a.permitido).toBe(false);
    expect(a.motivo).toBe('reembolsada');
  });

  it('sem reembolso, nada muda', () => {
    const a = calcularAcesso(
      {
        status: AssinaturaStatus.ACTIVE,
        trialEndsAt: null,
        currentPeriodEnd: dias(20),
        reembolsadaEm: null,
      },
      NOW,
    );

    expect(a.permitido).toBe(true);
  });

  // Sem isto a conta reembolsada nunca entraria na retenção: o `status` seguiria
  // `active` e o `fimDoAcesso` devolveria null (= "não sei, não apague").
  it('fimDoAcesso é o instante do reembolso', () => {
    const reembolso = dias(-3);
    expect(
      fimDoAcesso(
        {
          status: AssinaturaStatus.ACTIVE,
          trialEndsAt: null,
          currentPeriodEnd: dias(20),
          reembolsadaEm: reembolso,
        },
        NOW,
      ),
    ).toEqual(reembolso);
  });
});
