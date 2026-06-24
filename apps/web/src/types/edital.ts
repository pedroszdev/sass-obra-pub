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
  // true quando a API disparou uma captação sob demanda para a UF buscada
  // (UF nova / dado velho). Os editais aparecem numa busca seguinte.
  capturing?: boolean;
}

export interface EditalDetail extends EditalListItem {
  modalidadeId: number;
  createdAt: string;
  updatedAt: string;
}

// ---- análise por IA do edital (T-49/T-50) ----
// Espelha apps/api .../exigencias/exigencias-response.ts.

export type EditalIaStatus = 'extraido' | 'indisponivel' | 'erro';

export interface DataChave {
  evento: string;
  quando: string;
}

export interface ResumoEdital {
  visaoGeral: string;
  prazoExecucao: string | null;
  datasChave: DataChave[];
  pontosDeAtencao: string[];
}

export interface EditalIaResult {
  editalId: string;
  status: EditalIaStatus;
  // Resumo de 1 página (T-50). null quando indisponível/erro.
  resumo: ResumoEdital | null;
  // `exigencias` (T-49) também vem no payload; será tipado e usado na T-52.
  modelo: string | null;
  documentoNome: string | null;
  trechosOk: number | null;
  trechosTotal: number | null;
  atualizadoEm: string;
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
