// Porte da empresa do empreiteiro. Alinha com o benefício ME/EPP que será
// usado no filtro por faixa de valor (BACKLOG T-21).
export enum CompanyPorte {
  ME = 'ME', // Microempresa
  EPP = 'EPP', // Empresa de Pequeno Porte
  DEMAIS = 'DEMAIS', // Demais portes
}

// Teto, em reais, da licitação exclusiva para ME/EPP (LC 123/2006, art. 48, I).
// Regra de negócio centralizada (CLAUDE.md §3.3): a faixa de valor no backend
// é livre (T-21); a UI usa esta constante para o preset "benefício ME/EPP".
export const ME_EPP_VALOR_LIMITE = 80_000;
