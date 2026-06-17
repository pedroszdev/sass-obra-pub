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
}

// Envelope paginado da busca.
export interface EditalSearchResult {
  data: EditalListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export function toEditalListItem(edital: Edital): EditalListItem {
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
  };
}
