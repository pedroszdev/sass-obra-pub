import { Uf } from '../../common/uf';
import { EditalFonte } from '../edital-fonte.enum';
import { Edital } from '../edital.entity';

// Forma de um edital na lista de busca — exclui colunas internas pesadas
// (`rawPayload`) e a coluna técnica de full-text (`objetoBusca`).
export interface EditalListItem {
  id: string;
  fonte: EditalFonte;
  orgaoNome: string;
  orgaoCnpj: string | null;
  uf: Uf;
  municipioNome: string;
  codigoIbge: string | null;
  objeto: string;
  modalidadeNome: string;
  valorEstimado: number | null;
  dataPublicacao: Date;
  prazoProposta: Date | null;
  linkOrigem: string | null;
  situacao: string | null;
  isObra: boolean;
  // T-83: true quando a IA já gerou o resumo deste edital (cache pronto, sem
  // abrir). Só lê o cache — nunca dispara IA. O front mostra um selo "Resumo IA".
  resumoPronto: boolean;
}

// Envelope paginado da busca.
export interface EditalSearchResult {
  data: EditalListItem[];
  total: number;
  page: number;
  pageSize: number;
  // T-34: true quando a busca disparou uma captação sob demanda para a UF (UF
  // nova ou dado velho). A UI usa isso para avisar "buscando editais desta região
  // pela primeira vez — atualize em instantes".
  capturing?: boolean;
}

export function toEditalListItem(
  edital: Edital,
  resumoPronto = false,
): EditalListItem {
  return {
    id: edital.id,
    fonte: edital.fonte,
    orgaoNome: edital.orgaoNome,
    orgaoCnpj: edital.orgaoCnpj,
    uf: edital.uf,
    municipioNome: edital.municipioNome,
    codigoIbge: edital.codigoIbge,
    objeto: edital.objeto,
    modalidadeNome: edital.modalidadeNome,
    valorEstimado: edital.valorEstimado,
    dataPublicacao: edital.dataPublicacao,
    prazoProposta: edital.prazoProposta,
    linkOrigem: edital.linkOrigem,
    situacao: edital.situacao,
    isObra: edital.isObra,
    resumoPronto,
  };
}

// Detalhe completo de um edital (T-23). Todos os dados de domínio — os campos
// da lista mais `modalidadeId` e os timestamps internos. Continua excluindo
// `rawPayload` (dump cru da fonte, uso interno) e `objetoBusca` (full-text).
export interface EditalDetail extends EditalListItem {
  modalidadeId: number;
  createdAt: Date;
  updatedAt: Date;
}

export function toEditalDetail(edital: Edital): EditalDetail {
  return {
    ...toEditalListItem(edital),
    modalidadeId: edital.modalidadeId,
    createdAt: edital.createdAt,
    updatedAt: edital.updatedAt,
  };
}
