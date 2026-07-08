import { Atestado } from '../atestado.entity';
import { Certidao } from '../certidao.entity';
import { CertidaoTipo } from '../certidao-tipo.enum';
import { CompanyProfile } from '../company-profile.entity';
import { RegistroProfissionalTipo } from '../registro-profissional-tipo.enum';

// Respostas da API do perfil (BACKLOG T-41). Omitem o user_id (é sempre o
// logado) e expõem só o que o cliente precisa.

export interface CompanyProfileResponse {
  id: string;
  razaoSocial: string | null;
  telefone: string | null;
  capitalSocial: number | null;
  registroProfissionalTipo: RegistroProfissionalTipo | null;
  registroProfissionalNumero: string | null;
  registroProfissionalUf: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// Metadados do arquivo anexado (sem os bytes) — o que a listagem precisa saber.
export interface ArquivoMeta {
  nomeArquivo: string;
  mimeType: string;
  tamanhoBytes: number;
}

export interface CertidaoResponse {
  id: string;
  tipo: CertidaoTipo;
  descricao: string | null;
  numero: string | null;
  orgaoEmissor: string | null;
  dataEmissao: string | null;
  dataValidade: string | null;
  // null quando ainda não há arquivo anexado à certidão.
  arquivo: ArquivoMeta | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AtestadoResponse {
  id: string;
  descricao: string;
  quantitativo: number | null;
  unidade: string | null;
  valor: number | null;
  contratante: string | null;
  ano: number | null;
  createdAt: Date;
  updatedAt: Date;
}

// Snapshot completo devolvido pelo GET /company-profile (uma chamada p/ a tela).
export interface CompanyProfileSnapshot {
  profile: CompanyProfileResponse | null;
  certidoes: CertidaoResponse[];
  atestados: AtestadoResponse[];
}

export function toCompanyProfileResponse(
  p: CompanyProfile,
): CompanyProfileResponse {
  return {
    id: p.id,
    razaoSocial: p.razaoSocial,
    telefone: p.telefone,
    capitalSocial: p.capitalSocial,
    registroProfissionalTipo: p.registroProfissionalTipo,
    registroProfissionalNumero: p.registroProfissionalNumero,
    registroProfissionalUf: p.registroProfissionalUf,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

export function toCertidaoResponse(
  c: Certidao,
  arquivo: ArquivoMeta | null = null,
): CertidaoResponse {
  return {
    id: c.id,
    tipo: c.tipo,
    descricao: c.descricao,
    numero: c.numero,
    orgaoEmissor: c.orgaoEmissor,
    dataEmissao: c.dataEmissao,
    dataValidade: c.dataValidade,
    arquivo,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export function toAtestadoResponse(a: Atestado): AtestadoResponse {
  return {
    id: a.id,
    descricao: a.descricao,
    quantitativo: a.quantitativo,
    unidade: a.unidade,
    valor: a.valor,
    contratante: a.contratante,
    ano: a.ano,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}
