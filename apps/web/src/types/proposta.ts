// Tipos das propostas/orçamentos (espelham a API — BACKLOG T-60/T-61).
// Datas chegam como string ISO no cliente. (Dívida CLAUDE.md §10: deveriam
// morar em packages/; seguem no front por ora, como os demais tipos.)

export type PropostaStatus = 'rascunho' | 'finalizada';

export interface Proposta {
  id: string;
  editalId: string;
  titulo: string;
  status: PropostaStatus;
  bdiPercentual: number | null;
  valorReferencia: number | null;
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

// Detalhe da proposta com seus itens (GET /propostas/:id).
export interface PropostaDetail extends Proposta {
  itens: PropostaItem[];
}

// Payload de criação (status nasce rascunho no backend; valorReferencia herda
// o teto do edital quando ausente).
export interface CreatePropostaInput {
  titulo: string;
  editalId: string;
  bdiPercentual?: number;
  valorReferencia?: number;
}
