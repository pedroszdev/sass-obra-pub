import { ItensStatus } from '../../editais/itens/edital-itens-extracao.entity';
import { calcularProposta, PropostaCalculo } from '../calculo';
import {
  calcularCronograma,
  EtapaCronogramaCalculada,
  somaPercentual,
} from '../cronograma';
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
  // Data de envio ao certame (T-84); null enquanto rascunho.
  dataEnvio: Date | null;
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
  // Cronograma físico-financeiro (T-93): etapas com o valor derivado por etapa
  // e o total de percentual (o front avisa quando não fecha 100%).
  cronograma: EtapaCronogramaCalculada[];
  cronogramaPercentualTotal: number;
}

// Resultado da importação de itens do edital (T-64). status = situação da
// extração do edital; importados = quantos itens entraram; proposta = detalhe
// atualizado. status != 'extraido' ou importados 0 → o front cai no manual (T-65).
export interface ImportarItensResponse {
  status: ItensStatus;
  importados: number;
  proposta: PropostaDetailResponse;
}

export function toPropostaResponse(p: Proposta): PropostaResponse {
  return {
    id: p.id,
    editalId: p.editalId,
    titulo: p.titulo,
    status: p.status,
    bdiPercentual: p.bdiPercentual,
    valorReferencia: p.valorReferencia,
    dataEnvio: p.dataEnvio,
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
    valorReferencia: p.valorReferencia,
  });
  return {
    ...toPropostaResponse(p),
    itens: itens.map(toPropostaItemResponse),
    calculo,
    cronograma: calcularCronograma(p.cronograma, calculo.valorGlobal),
    cronogramaPercentualTotal: somaPercentual(p.cronograma),
  };
}
