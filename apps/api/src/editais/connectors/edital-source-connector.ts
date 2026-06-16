import { EditalFonte } from '../edital-fonte.enum';
import { EditalQuery } from './edital-query';
import { EditalSourceRecord } from './edital-source-record';

// Contrato único de captação (CLAUDE.md §3.1 — a decisão arquitetural central).
// Toda fonte (PNCP, Portal de Compras Públicas, ...) implementa esta interface.
// O resto do sistema (job, dedup, banco) só conhece este contrato — nunca os
// detalhes de uma fonte específica.
//
// Adicionar uma fonte nova = uma classe que implementa esta interface, registrada
// com o token abaixo. Nada mais no sistema precisa mudar.
export interface EditalSourceConnector {
  // Identifica a fonte — usado no controle de sincronização por fonte+UF (T-08).
  readonly fonte: EditalFonte;

  // Dado um período numa UF, emite os editais já no formato interno padronizado.
  // É um AsyncIterable para esconder paginação e rate limit (T-13) e deixar o job
  // processar/salvar página a página, sem segurar tudo em memória.
  fetchEditais(query: EditalQuery): AsyncIterable<EditalSourceRecord>;
}

// Token de DI que resolve para `EditalSourceConnector[]` — todos os conectores
// agregados por um factory no EditaisModule. O job (T-18) injeta o array e itera
// todos, sem conhecer fonte específica. Fonte nova = adicionar seu provider e
// incluí-lo no factory.
export const EDITAL_SOURCE_CONNECTORS = Symbol('EDITAL_SOURCE_CONNECTORS');
