import { EditalExigencias, ExigenciasStatus } from './edital-exigencias.entity';
import { ExigenciasHabilitacao } from './exigencias.types';

// Resposta do endpoint de exigências (T-49). Não vaza a relação `edital` nem
// colunas internas; expõe o sinal de qualidade para a T-52 decidir o que mostrar.
export interface ExigenciasResponse {
  editalId: string;
  status: ExigenciasStatus;
  exigencias: ExigenciasHabilitacao | null;
  modelo: string | null;
  documentoNome: string | null;
  trechosOk: number | null;
  trechosTotal: number | null;
  atualizadoEm: Date;
}

export function toExigenciasResponse(e: EditalExigencias): ExigenciasResponse {
  return {
    editalId: e.editalId,
    status: e.status,
    exigencias: e.exigencias,
    modelo: e.modelo,
    documentoNome: e.documentoNome,
    trechosOk: e.trechosOk,
    trechosTotal: e.trechosTotal,
    atualizadoEm: e.updatedAt,
  };
}
