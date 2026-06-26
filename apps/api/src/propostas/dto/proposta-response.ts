import { Proposta } from '../proposta.entity';
import { PropostaItem } from '../proposta-item.entity';
import { PropostaStatus } from '../proposta-status.enum';

// Respostas da API de propostas (BACKLOG T-61). Omitem o user_id (é sempre o
// logado) e não trazem totais calculados — subtotais/BDI/valor global são
// derivados pelo motor de cálculo (T-66), não persistidos (§3.3).

export interface PropostaResponse {
  id: string;
  editalId: string;
  titulo: string;
  status: PropostaStatus;
  bdiPercentual: number | null;
  valorReferencia: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PropostaItemResponse {
  id: string;
  descricao: string;
  unidade: string | null;
  quantidade: number | null;
  precoUnitario: number | null;
  ordem: number;
  createdAt: Date;
  updatedAt: Date;
}

// Detalhe da proposta com seus itens (GET /propostas/:id).
export interface PropostaDetailResponse extends PropostaResponse {
  itens: PropostaItemResponse[];
}

export function toPropostaResponse(p: Proposta): PropostaResponse {
  return {
    id: p.id,
    editalId: p.editalId,
    titulo: p.titulo,
    status: p.status,
    bdiPercentual: p.bdiPercentual,
    valorReferencia: p.valorReferencia,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

export function toPropostaItemResponse(i: PropostaItem): PropostaItemResponse {
  return {
    id: i.id,
    descricao: i.descricao,
    unidade: i.unidade,
    quantidade: i.quantidade,
    precoUnitario: i.precoUnitario,
    ordem: i.ordem,
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
  };
}

export function toPropostaDetailResponse(
  p: Proposta,
  itens: PropostaItem[],
): PropostaDetailResponse {
  return { ...toPropostaResponse(p), itens: itens.map(toPropostaItemResponse) };
}
