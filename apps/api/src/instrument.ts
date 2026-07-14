import * as Sentry from '@sentry/nestjs';

// Observabilidade (BACKLOG T-106). ESTE ARQUIVO É IMPORTADO ANTES DE TUDO no
// main.ts — a instrumentação do Sentry precisa rodar antes dos outros módulos
// serem carregados, senão ela não consegue envolver o que já foi importado.
// Não mova este import para baixo, e não importe nada pesado aqui.
//
// Por que existe: até aqui éramos CEGOS em produção. O e-mail ficou quebrado
// dias (SMTP bloqueado no Render) e só descobrimos porque o dono tentou criar
// uma conta e a tela travou. Erro em produção que ninguém vê é erro que fica.
//
// SEM `SENTRY_DSN` → desligado (não quebra o boot). Mesmo padrão de degradação
// da IA, do Google e do e-mail (§8): a ausência de uma integração opcional nunca
// derruba o produto.
const dsn = process.env.SENTRY_DSN?.trim();

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    // Amostragem de performance: 10% dos pedidos. O plano free tem cota, e o que
    // queremos aqui é ERRO, não APM fino.
    tracesSampleRate: 0.1,
    // NÃO manda dado pessoal por padrão (IP, headers, corpo). O produto lida com
    // CNPJ, e-mail e documentos do empreiteiro — LGPD (T-102). Erro sem PII
    // continua útil: temos stack trace, rota e o resto do contexto.
    sendDefaultPii: false,
  });
}

export const sentryHabilitado = Boolean(dsn);
