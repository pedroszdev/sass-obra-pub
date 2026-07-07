// Agenda de prazos (T-91) — espelha a API. Hoje só dois tipos reais: entrega da
// proposta (prazo do edital salvo/com proposta) e vencimento de certidão.
export type AgendaTipo =
  | 'entrega_proposta'
  | 'certidao_vencimento'
  | 'data_edital';

export interface AgendaEvento {
  tipo: AgendaTipo;
  /** Instante do prazo (ISO). O front calcula os dias no fuso de Brasília. */
  data: string;
  titulo: string;
  subtitulo: string | null;
  editalId: string | null;
  propostaId: string | null;
}
