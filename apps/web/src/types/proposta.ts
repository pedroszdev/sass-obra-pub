// Tipos das propostas/orçamentos (espelham a API — BACKLOG T-60/T-61).
// Datas chegam como string ISO no cliente. (Dívida CLAUDE.md §10: deveriam
// morar em packages/; seguem no front por ora, como os demais tipos.)

// Ciclo de status (T-84): rascunho → enviada → ganhou | nao_ganhou.
export type PropostaStatus = 'rascunho' | 'enviada' | 'ganhou' | 'nao_ganhou';

export interface Proposta {
  id: string;
  editalId: string;
  titulo: string;
  status: PropostaStatus;
  bdiPercentual: number | null;
  valorReferencia: number | null;
  /** Data de envio ao certame (T-84); null enquanto rascunho. ISO. */
  dataEnvio: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PropostaItem {
  id: string;
  descricao: string;
  unidade: string | null;
  quantidade: number | null;
  precoUnitario: number | null;
  ordem: number;
  createdAt: string;
  updatedAt: string;
}

// Totais calculados pelo backend (T-66) — o front só renderiza (§3.3).
export interface ItemCalculo {
  subtotal: number;
  semPreco: boolean;
}

// Relação da proposta com o teto do edital (T-69).
export interface ComparacaoTeto {
  valorReferencia: number;
  /** teto − valor global. Positivo = abaixo do teto (folga); negativo = acima. */
  economia: number;
  percentualDoTeto: number;
  /** abaixo (+) ou acima (−) do teto, em pontos %. */
  diferencaPercentual: number;
  abaixoDoTeto: boolean;
}

export interface PropostaCalculo {
  itens: ItemCalculo[];
  custoDireto: number;
  bdiPercentual: number;
  valorBdi: number;
  valorGlobal: number;
  totalItens: number;
  itensSemPreco: number;
  comparacao: ComparacaoTeto | null;
}

// Etapa do cronograma físico-financeiro (T-93) — valor derivado pelo backend.
export interface EtapaCronograma {
  descricao: string;
  percentual: number;
  valor: number;
}

// Detalhe da proposta com seus itens e os totais (GET /propostas/:id).
export interface PropostaDetail extends Proposta {
  itens: PropostaItem[];
  calculo: PropostaCalculo;
  cronograma: EtapaCronograma[];
  cronogramaPercentualTotal: number;
}

// Entrada de criação/edição de item (T-61/T-65).
export interface CreatePropostaItemInput {
  descricao: string;
  unidade?: string | null;
  quantidade?: number | null;
  precoUnitario?: number | null;
}

export type UpdatePropostaItemInput = Partial<CreatePropostaItemInput>;

// Resultado do "importar itens do edital" (T-64).
export type ItensExtracaoStatus = 'extraido' | 'indisponivel' | 'erro';
export interface ImportarItensResponse {
  status: ItensExtracaoStatus;
  importados: number;
  proposta: PropostaDetail;
}

// Payload de criação (status nasce rascunho no backend; valorReferencia herda
// o teto do edital quando ausente).
export interface CreatePropostaInput {
  titulo: string;
  editalId: string;
  bdiPercentual?: number;
  valorReferencia?: number;
}
