import {
  EditalItensExtracao,
  ItensStatus,
} from './edital-itens-extracao.entity';
import { ItemPlanilha } from './itens.types';

// Resposta da extração de itens do edital (T-64). itens vem [] quando
// indisponível/erro — o front cai no fallback manual (T-65).
export interface ItensExtraidosResponse {
  editalId: string;
  status: ItensStatus;
  itens: ItemPlanilha[];
  formato: string | null;
  documentoNome: string | null;
  atualizadoEm: Date;
}

export function toItensResponse(
  e: EditalItensExtracao,
): ItensExtraidosResponse {
  return {
    editalId: e.editalId,
    status: e.status,
    itens: e.itens ?? [],
    formato: e.formato,
    documentoNome: e.documentoNome,
    atualizadoEm: e.updatedAt,
  };
}
