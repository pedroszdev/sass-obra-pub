import { calcularProposta, PropostaCalculo } from '../calculo';
import { Proposta } from '../proposta.entity';
import { PropostaItem } from '../proposta-item.entity';
import { PropostaStatus } from '../proposta-status.enum';

// Respostas da API de propostas (BACKLOG T-61). Omitem o user_id (é sempre o
// logado). O detalhe traz os totais calculados (T-66) — derivados de qtd × preço
// + BDI pelo motor de cálculo, NÃO persistidos (§3.3).

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

// Detalhe da proposta com seus itens e os totais calculados (GET /propostas/:id).
export interface PropostaDetailResponse extends PropostaResponse {
  itens: PropostaItemResponse[];
  calculo: PropostaCalculo;
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
  const calculo = calcularProposta({
    itens: itens.map((i) => ({
      quantidade: i.quantidade,
      precoUnitario: i.precoUnitario,
    })),
    bdiPercentual: p.bdiPercentual,
  });
  return {
    ...toPropostaResponse(p),
    itens: itens.map(toPropostaItemResponse),
    calculo,
  };
}
