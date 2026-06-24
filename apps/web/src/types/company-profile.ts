// Tipos do perfil de habilitação (espelham a API — BACKLOG T-40/T-41/T-41b).
// Datas chegam como string ISO no cliente. (Dívida CLAUDE.md §10: deveriam
// morar em packages/; seguem no front por ora, como os demais tipos.)

export type CertidaoTipo =
  | 'CND_FEDERAL'
  | 'FGTS'
  | 'TRABALHISTA'
  | 'ESTADUAL'
  | 'MUNICIPAL'
  | 'FALENCIA'
  | 'REGISTRO_CONSELHO'
  | 'OUTRA';

export type RegistroProfissionalTipo = 'CREA' | 'CAU';

export interface ArquivoMeta {
  nomeArquivo: string;
  mimeType: string;
  tamanhoBytes: number;
}

export interface Certidao {
  id: string;
  tipo: CertidaoTipo;
  descricao: string | null;
  numero: string | null;
  orgaoEmissor: string | null;
  dataEmissao: string | null;
  dataValidade: string | null;
  arquivo: ArquivoMeta | null;
  createdAt: string;
  updatedAt: string;
}

export interface Atestado {
  id: string;
  descricao: string;
  quantitativo: number | null;
  unidade: string | null;
  valor: number | null;
  contratante: string | null;
  ano: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyProfile {
  id: string;
  razaoSocial: string | null;
  capitalSocial: number | null;
  registroProfissionalTipo: RegistroProfissionalTipo | null;
  registroProfissionalNumero: string | null;
  registroProfissionalUf: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyProfileSnapshot {
  profile: CompanyProfile | null;
  certidoes: Certidao[];
  atestados: Atestado[];
}

// Prontidão genérica (T-45/T-46) — espelha a saída do motor no backend.
export type RequisitoCategoria =
  | 'fiscal'
  | 'trabalhista'
  | 'economico_financeira'
  | 'tecnica';

export type ProntidaoStatus = 'atendido' | 'atencao' | 'nao_atendido';

export interface ProntidaoItem {
  key: string;
  label: string;
  categoria: RequisitoCategoria;
  status: ProntidaoStatus;
  motivo: string;
}

export interface ProntidaoResult {
  itens: ProntidaoItem[];
  total: number;
  atendidos: number;
  atencao: number;
  naoAtendidos: number;
  percentual: number;
}

// Payloads de criação/edição (campos opcionais viram merge no backend).
export interface CertidaoInput {
  tipo: CertidaoTipo;
  descricao?: string | null;
  numero?: string | null;
  orgaoEmissor?: string | null;
  dataEmissao?: string | null;
  dataValidade?: string | null;
}

export interface AtestadoInput {
  descricao: string;
  quantitativo?: number | null;
  unidade?: string | null;
  valor?: number | null;
  contratante?: string | null;
  ano?: number | null;
}
