import { EditalExigencias, ExigenciasStatus } from './edital-exigencias.entity';
import { ExigenciasHabilitacao, ResumoEdital } from './exigencias.types';

// Resposta do endpoint de exigências (T-49). Não vaza a relação `edital` nem
// colunas internas; expõe o sinal de qualidade para a T-52 decidir o que mostrar.
export interface ExigenciasResponse {
  editalId: string;
  status: ExigenciasStatus;
  exigencias: ExigenciasHabilitacao | null;
  // Resumo de 1 página gerado por IA (T-50) — alimenta "Resumo com IA".
  resumo: ResumoEdital | null;
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
    resumo: e.resumo,
    modelo: e.modelo,
    documentoNome: e.documentoNome,
    trechosOk: e.trechosOk,
    trechosTotal: e.trechosTotal,
    atualizadoEm: e.updatedAt,
  };
}
