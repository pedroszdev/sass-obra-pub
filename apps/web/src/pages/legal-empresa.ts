// Identificação do CONTROLADOR — os dados que os Termos e a Privacidade
// precisam declarar (T-179).
//
// 🔴 **Fonte única de propósito.** Razão social e CNPJ aparecem nos dois
// documentos e, mais tarde, na NFS-e (T-219). Escritos duas vezes, divergem no
// dia em que um mudar — e num texto jurídico a divergência não é bug de tela, é
// documento inconsistente.
//
// Preenchido em 04/08/2026 com o CCMEI (CNPJ aberto no mesmo dia).
//
// ⚠️ É um **MEI**, e isso tem duas consequências fora do código, registradas
// aqui porque é onde alguém vai reler os dados da empresa:
//   1. **Teto de faturamento.** O MEI tem limite anual de receita; passar dele
//      obriga desenquadramento. Confira o valor vigente com o contador e refaça
//      a conta contra o preço da assinatura — é um teto de NEGÓCIO, não de
//      software, e ele chega antes do que parece.
//   2. **CNAE 5819-1/00** (edição de cadastros e listas). É o que define o
//      código de serviço municipal da NFS-e (T-219) — errar ali erra o ISS.
//      **Confirme com o contador antes de configurar a emissão.**
export const EMPRESA = {
  // Nome Empresarial do MEI, como consta no CCMEI — é este que vai à NFS-e.
  razaoSocial: '68.370.259 PEDRO MANOEL DE SOUZA',
  cnpj: '68.370.259/0001-68',
  endereco:
    'Avenida Salvador Di Bernardi, 840, Campinas, São José/SC, CEP 88101-260',
  /**
   * Canal de suporte e de exercício dos direitos LGPD.
   *
   * 🔴 **PRECISA EXISTIR E SER LIDO.** É para cá que o texto manda quem quer
   * reembolso (art. 49 do CDC) e quem exerce direito de titular — prazos que
   * correm contra nós. Endereço que não recebe é pior que placeholder: o
   * documento passa a prometer um canal inexistente.
   */
  email: 'contato@prumolicita.com.br',
  /** Foro eleito — casa com a sede declarada acima. */
  foro: 'São José, Santa Catarina',
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
