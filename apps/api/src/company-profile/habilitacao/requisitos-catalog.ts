import { CertidaoTipo } from '../certidao-tipo.enum';

// Catálogo configurável dos requisitos comuns de habilitação de obra pública
// (BACKLOG T-44). Mesmo espírito do catálogo de obra (T-09): regra de negócio
// CENTRALIZADA aqui, ajustável editando esta lista — não espalhe pelo código.
// (Pode virar config em banco depois.)
//
// Cobre o que quase toda licitação de obra exige e que dá para CHECAR contra o
// perfil do empreiteiro (T-40/T-41). Fora daqui de propósito: habilitação
// jurídica (contrato social, cartão CNPJ) e balanço/índices contábeis — não há
// campo no perfil que os comprove, então entrariam sempre como "faltando" e
// poluiriam o diagnóstico. Podem entrar quando o perfil os modelar.
//
// O motor que cruza perfil × requisitos (tem/falta) é a T-45; aqui é só a lista.

export type RequisitoCategoria =
  | 'fiscal'
  | 'trabalhista'
  | 'economico_financeira'
  | 'tecnica';

// Como o requisito é satisfeito. União discriminada por `tipo` — a T-45 mapeia
// cada variante para uma verificação no perfil.
export type RequisitoCheck =
  | { tipo: 'certidao'; certidaoTipo: CertidaoTipo; exigeValidade: boolean }
  | { tipo: 'registro_conselho' } // registro profissional (CREA/CAU) no perfil
  | { tipo: 'capacidade_tecnica' } // ao menos um atestado
  | { tipo: 'capital_social' }; // capital social informado (> 0)

export interface RequisitoHabilitacao {
  /** Identificador estável (não traduzir; é a chave do requisito). */
  key: string;
  /** Rótulo curto para o usuário final (PT-BR). */
  label: string;
  /** Explicação breve do que é o requisito. */
  descricao: string;
  categoria: RequisitoCategoria;
  /** Como o sistema verifica se o empreiteiro atende (avaliado na T-45). */
  check: RequisitoCheck;
  /** Base legal (Lei 14.133/2021) — só para clareza/UX. */
  baseLegal?: string;
}

export const REQUISITOS_HABILITACAO_OBRA: RequisitoHabilitacao[] = [
  {
    key: 'regularidade_federal',
    label: 'Regularidade com a Fazenda Federal (CND)',
    descricao:
      'Certidão Negativa de Débitos Federais (RFB/PGFN) — inclui a regularidade previdenciária.',
    categoria: 'fiscal',
    check: {
      tipo: 'certidao',
      certidaoTipo: CertidaoTipo.CND_FEDERAL,
      exigeValidade: true,
    },
    baseLegal: 'Lei 14.133/2021, art. 68',
  },
  {
    key: 'fgts',
    label: 'Regularidade com o FGTS (CRF)',
    descricao: 'Certificado de Regularidade do FGTS emitido pela Caixa.',
    categoria: 'fiscal',
    check: {
      tipo: 'certidao',
      certidaoTipo: CertidaoTipo.FGTS,
      exigeValidade: true,
    },
    baseLegal: 'Lei 14.133/2021, art. 68',
  },
  {
    key: 'trabalhista',
    label: 'Regularidade trabalhista (CNDT)',
    descricao:
      'Certidão Negativa de Débitos Trabalhistas, emitida pela Justiça do Trabalho.',
    categoria: 'trabalhista',
    check: {
      tipo: 'certidao',
      certidaoTipo: CertidaoTipo.TRABALHISTA,
      exigeValidade: true,
    },
    baseLegal: 'Lei 14.133/2021, art. 68',
  },
  {
    key: 'regularidade_estadual',
    label: 'Regularidade com a Fazenda Estadual',
    descricao:
      'Certidão de regularidade fiscal perante o estado da sede da empresa.',
    categoria: 'fiscal',
    check: {
      tipo: 'certidao',
      certidaoTipo: CertidaoTipo.ESTADUAL,
      exigeValidade: true,
    },
    baseLegal: 'Lei 14.133/2021, art. 68',
  },
  {
    key: 'regularidade_municipal',
    label: 'Regularidade com a Fazenda Municipal',
    descricao:
      'Certidão de regularidade fiscal perante o município da sede da empresa.',
    categoria: 'fiscal',
    check: {
      tipo: 'certidao',
      certidaoTipo: CertidaoTipo.MUNICIPAL,
      exigeValidade: true,
    },
    baseLegal: 'Lei 14.133/2021, art. 68',
  },
  {
    key: 'falencia',
    label: 'Negativa de falência / recuperação judicial',
    descricao: 'Certidão do distribuidor judicial da sede da empresa.',
    categoria: 'economico_financeira',
    check: {
      tipo: 'certidao',
      certidaoTipo: CertidaoTipo.FALENCIA,
      exigeValidade: true,
    },
    baseLegal: 'Lei 14.133/2021, art. 69',
  },
  {
    key: 'registro_conselho',
    label: 'Registro no conselho profissional (CREA/CAU)',
    descricao: 'Inscrição da empresa e do responsável técnico no CREA ou CAU.',
    categoria: 'tecnica',
    check: { tipo: 'registro_conselho' },
    baseLegal: 'Lei 14.133/2021, art. 67',
  },
  {
    key: 'capacidade_tecnica',
    label: 'Atestado de capacidade técnica',
    descricao: 'Comprovação de já ter executado obra de natureza compatível.',
    categoria: 'tecnica',
    check: { tipo: 'capacidade_tecnica' },
    baseLegal: 'Lei 14.133/2021, art. 67',
  },
  {
    key: 'capital_social',
    label: 'Capital social informado',
    descricao:
      'Qualificação econômico-financeira mínima. O percentual exigido varia por edital; aqui checamos apenas se está informado.',
    categoria: 'economico_financeira',
    check: { tipo: 'capital_social' },
    baseLegal: 'Lei 14.133/2021, art. 69',
  },
];
