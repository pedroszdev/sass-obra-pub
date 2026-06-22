// Teto, em reais, da licitação exclusiva para ME/EPP (LC 123/2006, art. 48, I).
// Espelha `ME_EPP_VALOR_LIMITE` do backend — a UI usa como preset do filtro de
// valor ("Até R$ 80 mil (ME/EPP)"), não como cálculo de diagnóstico.
export const ME_EPP_VALOR_LIMITE = 80_000;

// Prazo de proposta com este número de dias ou menos é destacado como urgente.
export const URGENT_DAYS = 7;

// Itens por página na busca (espelha o default da API).
export const DEFAULT_PAGE_SIZE = 20;
