// Espelha o contrato da API de editais (apps/api .../dto/edital-search-response.ts).
// Datas chegam como string ISO após o JSON.parse (o backend tipa como Date).

export type EditalFonte = 'PNCP';

export interface EditalListItem {
  id: string;
  fonte: EditalFonte;
  orgaoNome: string;
  orgaoCnpj: string | null;
  uf: string;
  municipioNome: string;
  codigoIbge: string | null;
  objeto: string;
  modalidadeNome: string;
  valorEstimado: number | null;
  dataPublicacao: string;
  prazoProposta: string | null;
  linkOrigem: string | null;
  situacao: string | null;
  isObra: boolean;
}

export interface EditalSearchResult {
  data: EditalListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface EditalDetail extends EditalListItem {
  modalidadeId: number;
  createdAt: string;
  updatedAt: string;
}

// Parâmetros aceitos por GET /editais (todos opcionais).
export interface SearchEditaisParams {
  uf?: string;
  q?: string;
  codigoIbge?: string;
  valorMin?: number;
  valorMax?: number;
  dataInicio?: string;
  dataFim?: string;
  page?: number;
  pageSize?: number;
}
