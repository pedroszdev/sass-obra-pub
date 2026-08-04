// Identificação do CONTROLADOR — os dados que os Termos e a Privacidade
// precisam declarar (T-179).
//
// 🔴 **Fonte única de propósito.** Razão social e CNPJ aparecem nos dois
// documentos e, mais tarde, na NFS-e (T-219). Escritos duas vezes, divergem no
// dia em que um mudar — e num texto jurídico a divergência não é bug de tela, é
// documento inconsistente.
//
// ⚠️ **PREENCHER ANTES DE PUBLICAR.** Enquanto houver `A PREENCHER`, o texto não
// identifica o controlador — e a LGPD (art. 9º, I) exige que o titular saiba
// quem trata os dados dele. O `terms_version` (T-196) só deve subir depois que
// estes campos estiverem reais, porque é ele que força todo mundo a re-aceitar.
export const EMPRESA = {
  razaoSocial: 'A PREENCHER — razão social completa',
  cnpj: 'A PREENCHER — 00.000.000/0001-00',
  endereco: 'A PREENCHER — logradouro, nº, cidade/UF, CEP',
  /** Canal de suporte e de exercício dos direitos LGPD. */
  email: 'A PREENCHER — contato@prumolicita.com.br',
  /** Foro eleito. Deve casar com a sede declarada acima. */
  foro: 'A PREENCHER — comarca/UF',
} as const;

/** Data da versão vigente. Sobe junto com o `terms_version` no /admin (T-196). */
export const ATUALIZADO_EM = 'agosto de 2026';

/**
 * Serviços de terceiros que tratam dados a nosso mando (subprocessadores).
 *
 * 🔴 Estava FALTANDO na Política: só a OpenAI era citada. A LGPD (art. 9º) exige
 * informar com quem os dados são compartilhados, e vários destes ficam **fora do
 * Brasil** — o que é transferência internacional (art. 33) e precisa ser dito,
 * não presumido.
 *
 * ⚠️ Mantenha em dia: integração nova que veja dado de usuário entra aqui no
 * mesmo commit. Lista desatualizada é pior que lista ausente, porque parece
 * completa.
 */
export const SUBPROCESSADORES = [
  {
    nome: 'Asaas',
    papel: 'processamento de pagamentos e emissão de cobranças',
    local: 'Brasil',
  },
  {
    nome: 'Render',
    papel: 'hospedagem da aplicação e do banco de dados',
    local: 'Estados Unidos',
  },
  {
    nome: 'Cloudflare',
    papel: 'rede de entrega, proteção contra abuso e controle de acesso interno',
    local: 'Estados Unidos',
  },
  {
    nome: 'OpenAI',
    papel: 'geração de resumos e extrações a partir do texto dos editais',
    local: 'Estados Unidos',
  },
  {
    nome: 'Resend',
    papel: 'envio dos e-mails do serviço',
    local: 'Estados Unidos',
  },
  {
    nome: 'Google',
    papel: 'entrada na conta com Google, quando você escolhe essa opção',
    local: 'Estados Unidos',
  },
  {
    nome: 'Sentry',
    papel: 'registro de erros da aplicação',
    local: 'Estados Unidos',
  },
] as const;
