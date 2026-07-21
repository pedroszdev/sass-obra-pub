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
  /** Assinatura devolvida (T-157). Null = não foi. Corta o acesso na hora. */
  reembolsadaEm?: Date | null;
  /** Cortesia do admin (T-185): libera o produto até esta data. Null = sem cortesia. */
  cortesiaAte?: Date | null;
  /** Suspensão do admin (T-185): conta bloqueada. Null = não suspensa. */
  suspensoEm?: Date | null;
}

export type MotivoBloqueio =
  | 'trial_expirado'
  | 'sem_pagamento'
  | 'cancelada'
  | 'reembolsada'
  | 'suspensa';

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

  // SUSPENSÃO do admin (T-185) vem antes de TUDO — inclusive da cortesia. É uma
  // ação negativa deliberada do dono; falha fechado (§8). Se o admin suspendeu e
  // também deu cortesia (contraditório), a suspensão ganha.
  if (assinatura.suspensoEm != null) {
    return {
      permitido: false,
      motivo: 'suspensa',
      diasRestantesTrial: 0,
      emTrial: false,
    };
  }

  // CORTESIA do admin (T-185): concessão explícita de acesso sem cartão, até uma
  // data. Sobrepõe o estado de pagamento — INCLUSIVE reembolso (decisão do dono):
  // por isso vem antes do bloco de reembolsada. Só a suspensão (acima) a vence.
  if (
    assinatura.cortesiaAte != null &&
    assinatura.cortesiaAte.getTime() > now.getTime()
  ) {
    return { permitido: true, diasRestantesTrial: 0, emTrial: false };
  }

  // REEMBOLSADA vem ANTES do resto (T-157): o dinheiro voltou, logo não há período
  // pago a honrar. Precisa preceder o `active` (a Stripe segue `active` até
  // alguém cancelar) e o `canceled` (cujo `currentPeriodEnd` no futuro liberaria
  // o acesso pela regra da T-144 — que é certa para quem cancelou tendo pago, e
  // errada para quem foi devolvido).
  if (assinatura.reembolsadaEm != null) {
    return {
      permitido: false,
      motivo: 'reembolsada',
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

// Quando o acesso deste usuário TERMINOU (BACKLOG T-144). `null` = ainda tem
// acesso (não é candidato a nada) OU não dá para saber com segurança — e "não
// saber" nunca pode virar exclusão de dados. É a base da retenção de 90 dias:
// guardamos os dados por N dias APÓS o acesso acabar, e é este o marco zero.
export function fimDoAcesso(
  assinatura: EstadoAssinatura | null,
  now: Date = new Date(),
): Date | null {
  // Sem assinatura conhecida: nunca apagar às cegas.
  if (!assinatura) return null;
  // Ainda tem acesso (ativo, trial válido, carência, cortesia) → não é candidato.
  if (calcularAcesso(assinatura, now).permitido) return null;
  // Suspensa (T-185): bloqueada por decisão do admin, NÃO por inatividade. O admin
  // controla o ciclo dela; a retenção automática nunca a apaga às cegas.
  if (assinatura.suspensoEm != null) return null;

  // Reembolsada (T-157): o acesso acabou no instante da devolução — e não no que
  // o `status` sugeriria. A Stripe pode continuar dizendo `active`, o que faria o
  // switch abaixo devolver null e a conta nunca entrar na retenção.
  if (assinatura.reembolsadaEm != null) return assinatura.reembolsadaEm;

  switch (assinatura.status) {
    // Trial expirou e nunca pagou: o acesso acabou no fim do trial.
    case AssinaturaStatus.TRIALING:
      return assinatura.trialEndsAt;
    // Inadimplente além da carência: o acesso acabou quando a carência estourou.
    case AssinaturaStatus.PAST_DUE:
      return assinatura.pastDueDesde
        ? new Date(
            assinatura.pastDueDesde.getTime() +
              PAST_DUE_CARENCIA_DIAS * 24 * 60 * 60 * 1000,
          )
        : null;
    // Cancelada: o acesso acabou no fim do período pago. Sem essa data (cancelou
    // sem período pago) NÃO deletamos — não sabemos desde quando está inativo.
    case AssinaturaStatus.CANCELED:
      return assinatura.currentPeriodEnd;
    // `active` teria permitido=true acima; defensivo.
    case AssinaturaStatus.ACTIVE:
      return null;
  }
}

/** true quando o acesso terminou há `dias` ou mais — candidato à exclusão (T-144). */
export function inativoHaMaisDe(
  assinatura: EstadoAssinatura | null,
  dias: number,
  now: Date = new Date(),
): boolean {
  const fim = fimDoAcesso(assinatura, now);
  if (!fim) return false;
  return now.getTime() - fim.getTime() >= dias * 24 * 60 * 60 * 1000;
}
