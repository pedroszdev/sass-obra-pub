import { AssinaturaStatus } from './assinatura-status.enum';

// Decide se o usuário pode usar o produto (BACKLOG T-127). Função PURA, com o
// `now` injetável (§3.3): o backend é o dono desta resposta e o front só a
// renderiza — se o front decidisse sozinho, "pode usar" viraria uma flag que
// qualquer um edita no DevTools.
//
// É esta função que o paywall (T-130) vai consumir. Aqui ela só existe e é
// testada — nesta task NINGUÉM é bloqueado ainda.

// Duração do trial: 7 dias, sem cartão (decisão do dono).
export const TRIAL_DIAS = 7;

// Carência em `past_due` (T-130): a Stripe ainda está retentando o cartão
// (dunning). Cortar o acesso de quem teve UMA recusa é perder cliente por
// bobagem — mas o número final é decisão do dono, na T-130. O default aqui é
// conservador e explícito.
export const PAST_DUE_CARENCIA_DIAS = 3;

export interface EstadoAssinatura {
  status: AssinaturaStatus;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  /** Quando o pagamento começou a falhar — base da carência. Null = não falhou. */
  pastDueDesde?: Date | null;
}

export type MotivoBloqueio = 'trial_expirado' | 'sem_pagamento' | 'cancelada';

export interface Acesso {
  permitido: boolean;
  /** Só quando bloqueado — o front usa para escolher a mensagem. */
  motivo?: MotivoBloqueio;
  /** Dias inteiros restantes do trial (0 quando acabou / não está em trial). */
  diasRestantesTrial: number;
  emTrial: boolean;
}

export function trialTermina(inicio: Date, dias: number = TRIAL_DIAS): Date {
  return new Date(inicio.getTime() + dias * 24 * 60 * 60 * 1000);
}

/** Dias inteiros até `fim` (0 se já passou). Arredonda para CIMA: um trial que
 *  acaba daqui a 6h ainda é "1 dia", não "0 dias" — dizer 0 a quem ainda tem
 *  acesso é mentir para o usuário. */
function diasAte(fim: Date | null, now: Date): number {
  if (!fim) return 0;
  const ms = fim.getTime() - now.getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / (24 * 60 * 60 * 1000));
}

export function calcularAcesso(
  assinatura: EstadoAssinatura | null,
  now: Date = new Date(),
): Acesso {
  // Sem assinatura nenhuma: conta antiga que a migration não alcançou, ou bug.
  // Trata como bloqueada — mas o T-130 vai deixar o caminho de pagar aberto.
  if (!assinatura) {
    return {
      permitido: false,
      motivo: 'sem_pagamento',
      diasRestantesTrial: 0,
      emTrial: false,
    };
  }

  const { status, trialEndsAt, currentPeriodEnd } = assinatura;
  const trialValido =
    trialEndsAt != null && trialEndsAt.getTime() > now.getTime();
  const diasRestantesTrial = diasAte(trialEndsAt, now);

  switch (status) {
    case AssinaturaStatus.TRIALING:
      return trialValido
        ? { permitido: true, diasRestantesTrial, emTrial: true }
        : {
            permitido: false,
            motivo: 'trial_expirado',
            diasRestantesTrial: 0,
            emTrial: false,
          };

    case AssinaturaStatus.ACTIVE:
      return { permitido: true, diasRestantesTrial: 0, emTrial: false };

    // Pagamento falhou e a Stripe está retentando. Segura o acesso pela carência
    // — quem só teve o cartão recusado uma vez não pode perder o produto na hora.
    case AssinaturaStatus.PAST_DUE: {
      const desde = assinatura.pastDueDesde ?? null;
      const limite = desde
        ? new Date(
            desde.getTime() + PAST_DUE_CARENCIA_DIAS * 24 * 60 * 60 * 1000,
          )
        : null;
      const dentroDaCarencia =
        limite != null && limite.getTime() > now.getTime();
      return dentroDaCarencia
        ? { permitido: true, diasRestantesTrial: 0, emTrial: false }
        : {
            permitido: false,
            motivo: 'sem_pagamento',
            diasRestantesTrial: 0,
            emTrial: false,
          };
    }

    // Cancelada: o acesso vale até o FIM DO PERÍODO JÁ PAGO (T-144). Cortar na
    // hora do cancelamento seria cobrar por um mês e entregar meio.
    case AssinaturaStatus.CANCELED: {
      const pagoAinda =
        currentPeriodEnd != null && currentPeriodEnd.getTime() > now.getTime();
      return pagoAinda
        ? { permitido: true, diasRestantesTrial: 0, emTrial: false }
        : {
            permitido: false,
            motivo: 'cancelada',
            diasRestantesTrial: 0,
            emTrial: false,
          };
    }
  }
}
