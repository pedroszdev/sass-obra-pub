// ⚠️ DADOS MOCKADOS — placeholders de fase (CLAUDE.md §9).
//
// As telas de Agenda, Perfil e Onboarding (e parte da Home) ainda NÃO têm
// endpoints no backend. Foram pré-criadas como casca visual a pedido do dono do
// produto. Tudo aqui é exemplo estático; quando os endpoints existirem, cada
// bloco vira uma chamada real à API. (Orçamentos saiu do mock na T-62.)

export type DocStatus = 'valido' | 'vencendo' | 'vencido' | 'faltando';

export interface MockDocumento {
  nome: string;
  status: DocStatus;
  validade: string | null;
}

export interface MockEditalSample {
  id: string;
  objeto: string;
  municipioNome: string;
  uf: string;
}

export const MOCK_DOCUMENTOS: MockDocumento[] = [
  { nome: 'Contrato social / última alteração', status: 'valido', validade: null },
  { nome: 'Cartão CNPJ', status: 'valido', validade: null },
  { nome: 'Certidão Negativa de Débitos Federais (CND)', status: 'vencendo', validade: '2026-07-05' },
  { nome: 'Certificado de Regularidade do FGTS (CRF)', status: 'valido', validade: '2026-08-20' },
  { nome: 'Certidão Negativa de Débitos Trabalhistas (CNDT)', status: 'valido', validade: '2026-09-10' },
  { nome: 'Certidão de regularidade estadual', status: 'vencido', validade: '2026-06-10' },
  { nome: 'Certidão de regularidade municipal', status: 'valido', validade: '2026-07-30' },
  { nome: 'Atestado de Capacidade Técnica (CAT/CREA)', status: 'valido', validade: null },
  { nome: 'Balanço patrimonial do último exercício', status: 'valido', validade: null },
  { nome: 'Certidão negativa de falência e concordata', status: 'vencendo', validade: '2026-07-02' },
  { nome: 'Registro da empresa no CREA/CAU', status: 'valido', validade: null },
  { nome: 'Cadastro SICAF — nível habilitação', status: 'faltando', validade: null },
];

// Editais de exemplo para o Select do checklist de habilitação.
export const MOCK_EDITAIS_SAMPLE: MockEditalSample[] = [
  {
    id: 'sample-ingleses',
    objeto: 'Pavimentação asfáltica e drenagem pluvial de vias urbanas no bairro Ingleses do Rio Vermelho.',
    municipioNome: 'Florianópolis',
    uf: 'SC',
  },
  {
    id: 'sample-ubs',
    objeto: 'Construção de Unidade Básica de Saúde (UBS) padrão FNDE no bairro Aventureiro.',
    municipioNome: 'Joinville',
    uf: 'SC',
  },
  {
    id: 'sample-escola',
    objeto: 'Reforma e ampliação da Escola Municipal de Ensino Fundamental Jardim América.',
    municipioNome: 'Chapecó',
    uf: 'SC',
  },
  {
    id: 'sample-ponte',
    objeto: 'Construção de ponte de concreto armado sobre o Rio Criciúma no bairro Próspera.',
    municipioNome: 'Criciúma',
    uf: 'SC',
  },
];

// Exigências de habilitação cruzadas com o cofre (por nome do documento).
export const MOCK_CHECKLIST_EXIGENCIAS: { req: string; doc: string }[] = [
  { req: 'Contrato social / última alteração', doc: 'Contrato social / última alteração' },
  { req: 'Regularidade fiscal federal (CND)', doc: 'Certidão Negativa de Débitos Federais (CND)' },
  { req: 'Regularidade FGTS (CRF)', doc: 'Certificado de Regularidade do FGTS (CRF)' },
  { req: 'Regularidade trabalhista (CNDT)', doc: 'Certidão Negativa de Débitos Trabalhistas (CNDT)' },
  { req: 'Regularidade estadual', doc: 'Certidão de regularidade estadual' },
  { req: 'Atestado de capacidade técnica compatível', doc: 'Atestado de Capacidade Técnica (CAT/CREA)' },
  { req: 'Balanço patrimonial', doc: 'Balanço patrimonial do último exercício' },
  { req: 'Certidão negativa de falência', doc: 'Certidão negativa de falência e concordata' },
  { req: 'Registro no CREA/CAU', doc: 'Registro da empresa no CREA/CAU' },
  { req: 'Cadastro SICAF (habilitação)', doc: 'Cadastro SICAF — nível habilitação' },
];

// Contagem dos documentos por status (para o resumo da prontidão).
export function contarDocumentos(documentos: MockDocumento[]): Record<DocStatus, number> {
  const counts: Record<DocStatus, number> = {
    valido: 0,
    vencendo: 0,
    vencido: 0,
    faltando: 0,
  };
  for (const doc of documentos) counts[doc.status] += 1;
  return counts;
}

// Prontidão de habilitação (%): válidos + meio peso para os que estão vencendo.
export function prontidaoHabilitacao(documentos: MockDocumento[]): number {
  const counts = contarDocumentos(documentos);
  return Math.round(
    ((counts.valido + 0.5 * counts.vencendo) / documentos.length) * 100,
  );
}
