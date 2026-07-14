import * as Sentry from '@sentry/nestjs';

// Reporte manual de erro ao Sentry (T-106).
//
// POR QUE EXISTE, se o SentryGlobalFilter já captura tudo: ele só vê exceção que
// SOBE por uma requisição HTTP. E a maior parte dos nossos erros de produção não
// sobe — a gente os engole de propósito, porque não podem derrubar o fluxo:
//
//   - falha de e-mail (best-effort: não pode travar o cadastro);
//   - falha da captação/notificação/retenção (job de fundo: loga e segue);
//
// Foi justamente um desses que ficou dias invisível: o SMTP bloqueado no Render
// escrevia `Falha ao enviar e-mail` no log e ninguém via. Engolir o erro para o
// USUÁRIO é certo; engoli-lo para NÓS é ser cego. Aqui ele vai para o Sentry.
//
// Sem `SENTRY_DSN`, o SDK não foi inicializado e isto é um no-op silencioso.
export function capturarErro(
  error: unknown,
  contexto: string,
  extras?: Record<string, unknown>,
): void {
  Sentry.captureException(error, {
    tags: { contexto },
    // Nada de PII (LGPD/T-102): só identificadores técnicos (id de edital, UF).
    // Nunca e-mail, CNPJ ou conteúdo de documento.
    extra: extras,
  });
}
