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
  /** T-83: true quando a IA já gerou o resumo deste edital (cache pronto). */
  resumoPronto: boolean;
  /** T-82: veredito de aptidão do usuário; null quando não há exigências extraídas. */
  veredito: Veredito | null;
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
  modelo: string | null;
  documentoNome: string | null;
  trechosOk: number | null;
  trechosTotal: number | null;
  atualizadoEm: string;
}

// ---- diagnóstico específico edital × perfil (T-51/T-52) ----
// Espelha apps/api .../habilitacao/diagnostico-edital.ts.

export type ProntidaoStatus = 'atendido' | 'atencao' | 'nao_atendido';
// 'indefinido' (T-116b): edital sem nenhum item verificável no perfil — não é
// "apto" nem "não apto"; fica fora do filtro de aptidão.
export type Veredito = 'apto' | 'quase' | 'nao_apto' | 'indefinido';

export interface DiagnosticoItem {
  key: string;
  label: string;
  status: ProntidaoStatus;
  motivo: string;
}

export interface DiagnosticoEditalResult {
  veredito: Veredito;
  itens: DiagnosticoItem[];
  total: number;
  atendidos: number;
  atencao: number;
  naoAtendidos: number;
  percentual: number;
  /** Rótulos do que falta para esta obra. */
  faltam: string[];
  /** Exigências sem campo no perfil (garantia, declarações…) — informativas. */
  observacoes: string[];
}

export interface DiagnosticoEditalResponse {
  editalId: string;
  exigenciasStatus: EditalIaStatus;
  atualizadoEm: string;
  // null quando o edital não tem exigências extraídas (indisponível/erro).
  diagnostico: DiagnosticoEditalResult | null;
}

// ---- filtro "só editais que estou apto" (T-53) ----

export interface EditalAptoListItem extends EditalListItem {
  veredito: Veredito;
}

export interface EditaisAptosResult {
  data: EditalAptoListItem[];
  total: number;
  page: number;
  pageSize: number;
}

// Resultado normalizado da busca (comum à busca normal e à por aptidão): o
// `veredito` agora faz parte do item (T-82), null quando não há cruzamento.
export type BuscaResultItem = EditalListItem;

export interface BuscaResult {
  data: BuscaResultItem[];
  total: number;
  page: number;
  pageSize: number;
  capturing?: boolean;
}

// Parâmetros aceitos por GET /editais (todos opcionais).
export type EditalSort = 'recentes' | 'prazo' | 'valor';

export interface SearchEditaisParams {
  /** Uma ou mais UFs (T-81). */
  uf?: string[];
  q?: string;
  /** Um ou mais municípios por código IBGE (T-81). */
  codigoIbge?: string[];
  /** Modalidades do PNCP (T-80): 4 = Concorrência Eletrônica, 5 = Presencial. */
  modalidade?: number[];
  /** Ordenação (T-81); ausente = recentes. */
  sort?: EditalSort;
  valorMin?: number;
  valorMax?: number;
  dataInicio?: string;
  dataFim?: string;
  page?: number;
  pageSize?: number;
}
