import {
  calcularAcesso,
  dataDaPrimeiraCobranca,
  fimDaCarencia,
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

  // `fimDaCarencia` virou função exportada porque a MESMA conta tem três
  // consumidores: quem deixa entrar, quem calcula a retenção e agora a TELA,
  // que precisa dizer a data ao cliente. Estes testes trancam a equivalência —
  // se ela divergir, a tela promete um prazo que o paywall não honra.
  it('a data que a tela mostra é a MESMA que o acesso respeita', () => {
    const desde = dias(-1);
    const limite = fimDaCarencia(desde)!;

    // Um instante antes do limite ainda entra; um depois, não.
    const antes = new Date(limite.getTime() - 1000);
    const depois = new Date(limite.getTime() + 1000);
    const estado = {
      status: AssinaturaStatus.PAST_DUE,
      trialEndsAt: null,
      currentPeriodEnd: dias(10),
      pastDueDesde: desde,
    };

    expect(calcularAcesso(estado, antes).permitido).toBe(true);
    expect(calcularAcesso(estado, depois).permitido).toBe(false);
    // E é a mesma data que a retenção usa como marco zero da inatividade.
    expect(fimDoAcesso(estado, depois)).toEqual(limite);
  });

  it('sem pastDueDesde não há data — e "não sei" nunca vira permissão', () => {
    expect(fimDaCarencia(null)).toBeNull();
    expect(
      calcularAcesso(
        {
          status: AssinaturaStatus.PAST_DUE,
          trialEndsAt: null,
          currentPeriodEnd: dias(10),
          pastDueDesde: null,
        },
        NOW,
      ).permitido,
    ).toBe(false);
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
describe('calcularAcesso — cortesia e suspensão do admin (T-185)', () => {
  it('cortesia válida libera mesmo com trial expirado', () => {
    const a = calcularAcesso(
      {
        status: AssinaturaStatus.TRIALING,
        trialEndsAt: dias(-3), // trial já acabou
        currentPeriodEnd: null,
        cortesiaAte: dias(10),
      },
      NOW,
    );
    expect(a.permitido).toBe(true);
    expect(a.emTrial).toBe(false);
  });

  it('cortesia libera até uma conta cancelada e sem período pago', () => {
    const a = calcularAcesso(
      {
        status: AssinaturaStatus.CANCELED,
        trialEndsAt: null,
        currentPeriodEnd: dias(-5),
        cortesiaAte: dias(5),
      },
      NOW,
    );
    expect(a.permitido).toBe(true);
  });

  it('cortesia sobrepõe reembolso (decisão do dono)', () => {
    const a = calcularAcesso(
      {
        status: AssinaturaStatus.ACTIVE,
        trialEndsAt: null,
        currentPeriodEnd: dias(20),
        reembolsadaEm: dias(-1),
        cortesiaAte: dias(5),
      },
      NOW,
    );
    expect(a.permitido).toBe(true);
  });

  it('cortesia expirada NÃO libera', () => {
    const a = calcularAcesso(
      {
        status: AssinaturaStatus.TRIALING,
        trialEndsAt: dias(-3),
        currentPeriodEnd: null,
        cortesiaAte: dias(-1),
      },
      NOW,
    );
    expect(a.permitido).toBe(false);
    expect(a.motivo).toBe('trial_expirado');
  });

  it('suspensão bloqueia mesmo com trial válido', () => {
    const a = calcularAcesso(
      {
        status: AssinaturaStatus.TRIALING,
        trialEndsAt: dias(5),
        currentPeriodEnd: null,
        suspensoEm: dias(-1),
      },
      NOW,
    );
    expect(a.permitido).toBe(false);
    expect(a.motivo).toBe('suspensa');
  });

  it('suspensão ganha da cortesia (falha fechado)', () => {
    const a = calcularAcesso(
      {
        status: AssinaturaStatus.ACTIVE,
        trialEndsAt: null,
        currentPeriodEnd: dias(20),
        cortesiaAte: dias(30),
        suspensoEm: dias(-1),
      },
      NOW,
    );
    expect(a.permitido).toBe(false);
    expect(a.motivo).toBe('suspensa');
  });

  it('fimDoAcesso não marca conta suspensa para exclusão', () => {
    const fim = fimDoAcesso(
      {
        status: AssinaturaStatus.TRIALING,
        trialEndsAt: dias(-30),
        currentPeriodEnd: null,
        suspensoEm: dias(-10),
      },
      NOW,
    );
    expect(fim).toBeNull();
  });
});

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

// T-215 — o paywall sobre o ESTADO UNIFICADO.
//
// A afirmação desta task é que a decisão de acesso **não sabe quem cobra**. Isso
// já era verdade por construção (`acesso.ts` não menciona stripe nem asaas), mas
// não estava PROVADO — e "é agnóstico" sem teste é a classe de afirmação que
// deixa de valer no primeiro campo novo que alguém lê aqui dentro.
describe('calcularAcesso é agnóstico de provider (T-215)', () => {
  const agora = new Date('2026-08-01T12:00:00Z');

  // Mesmo estado de negócio, dois provedores diferentes. Os campos específicos
  // de cada um estão preenchidos de propósito: se algum dia a decisão passar a
  // olhar `stripeSubscriptionId` (ou o `provider`), estes testes quebram.
  const comStripe = {
    status: AssinaturaStatus.ACTIVE,
    trialEndsAt: null,
    currentPeriodEnd: new Date('2026-09-01T12:00:00Z'),
    pastDueDesde: null,
    reembolsadaEm: null,
    cortesiaAte: null,
    suspensoEm: null,
    provider: 'stripe' as const,
    stripeSubscriptionId: 'sub_stripe',
    stripeCustomerId: 'cus_stripe',
    asaasSubscriptionId: null,
    asaasCustomerId: null,
  };
  const comAsaas = {
    ...comStripe,
    provider: 'asaas' as const,
    stripeSubscriptionId: null,
    stripeCustomerId: null,
    asaasSubscriptionId: 'sub_asaas',
    asaasCustomerId: 'cus_asaas',
  };

  it('assinatura ativa libera igual nos dois provedores', () => {
    const a = calcularAcesso(comStripe as never, agora);
    const b = calcularAcesso(comAsaas as never, agora);
    expect(a).toEqual(b);
    expect(b.permitido).toBe(true);
  });

  it('cancelada com período em aberto mantém acesso igual nos dois', () => {
    const cancelada = { status: AssinaturaStatus.CANCELED };
    const a = calcularAcesso({ ...comStripe, ...cancelada } as never, agora);
    const b = calcularAcesso({ ...comAsaas, ...cancelada } as never, agora);
    expect(a).toEqual(b);
    expect(b.permitido).toBe(true); // até o currentPeriodEnd (T-144)
  });

  it('past_due além da carência bloqueia igual nos dois', () => {
    const atrasada = {
      status: AssinaturaStatus.PAST_DUE,
      pastDueDesde: new Date('2026-07-01T12:00:00Z'),
      currentPeriodEnd: null,
    };
    const a = calcularAcesso({ ...comStripe, ...atrasada } as never, agora);
    const b = calcularAcesso({ ...comAsaas, ...atrasada } as never, agora);
    expect(a).toEqual(b);
    expect(b.permitido).toBe(false);
  });

  it('conta migrada — histórico Stripe E assinatura Asaas — decide pelo estado', () => {
    // O cenário que a T-211 tornou possível: os dois ids preenchidos ao mesmo
    // tempo. Se a decisão olhasse "tem id da Stripe?", erraria justamente aqui.
    const migrada = {
      ...comStripe,
      provider: 'asaas' as const,
      asaasSubscriptionId: 'sub_asaas',
      asaasCustomerId: 'cus_asaas',
      // stripe* seguem preenchidos, como HISTÓRICO
    };
    expect(calcularAcesso(migrada as never, agora).permitido).toBe(true);
  });

  it('trial expirado bloqueia mesmo sem provider nenhum (o trial é nosso)', () => {
    // `provider: null` é o estado de quem nunca pagou — o trial nasce no nosso
    // banco e não existe em provedor algum (T-127/T-213).
    const soTrial = {
      ...comStripe,
      status: AssinaturaStatus.TRIALING,
      provider: null,
      stripeSubscriptionId: null,
      stripeCustomerId: null,
      trialEndsAt: new Date('2026-07-20T12:00:00Z'),
      currentPeriodEnd: null,
    };
    const r = calcularAcesso(soTrial as never, agora);
    expect(r.permitido).toBe(false);
    expect(r.motivo).toBeTruthy();
  });
});

describe('dataDaPrimeiraCobranca', () => {
  // A ideia única das duas regras: não cobrar por tempo que a pessoa já tem.
  const base = {
    trialEndsAt: null,
    currentPeriodEnd: null,
  };

  it('sem assinatura → cobra hoje', () => {
    expect(dataDaPrimeiraCobranca(null, NOW)).toBeNull();
  });

  describe('conversão de trial (03/08)', () => {
    it('trial com dias restantes → adia para o fim do trial', () => {
      // Quem assina no 3º dia de um trial de 7 não perde os 4 que faltavam.
      const fim = dias(4);
      expect(
        dataDaPrimeiraCobranca(
          { ...base, status: AssinaturaStatus.TRIALING, trialEndsAt: fim },
          NOW,
        ),
      ).toBe(fim);
    });

    it('trial já vencido → cobra hoje', () => {
      expect(
        dataDaPrimeiraCobranca(
          {
            ...base,
            status: AssinaturaStatus.TRIALING,
            trialEndsAt: dias(-1),
          },
          NOW,
        ),
      ).toBeNull();
    });

    it('trial sem data → cobra hoje, nunca adia no escuro', () => {
      expect(
        dataDaPrimeiraCobranca(
          { ...base, status: AssinaturaStatus.TRIALING },
          NOW,
        ),
      ).toBeNull();
    });
  });

  describe('reativação (T-217)', () => {
    it('cancelada dentro do período pago → adia para o fim dele', () => {
      const fim = dias(30);
      expect(
        dataDaPrimeiraCobranca(
          {
            ...base,
            status: AssinaturaStatus.CANCELED,
            currentPeriodEnd: fim,
          },
          NOW,
        ),
      ).toBe(fim);
    });

    it('cancelada com período já vencido → cobra hoje', () => {
      expect(
        dataDaPrimeiraCobranca(
          {
            ...base,
            status: AssinaturaStatus.CANCELED,
            currentPeriodEnd: dias(-5),
          },
          NOW,
        ),
      ).toBeNull();
    });
  });

  it('past_due não adia — não há período concedido em aberto', () => {
    // ⚠️ Mesmo com trialEndsAt no futuro: quem chegou em past_due já saiu do
    // trial, e adiar aqui seria dar tempo grátis a quem não pagou.
    expect(
      dataDaPrimeiraCobranca(
        {
          ...base,
          status: AssinaturaStatus.PAST_DUE,
          trialEndsAt: dias(3),
        },
        NOW,
      ),
    ).toBeNull();
  });
});
