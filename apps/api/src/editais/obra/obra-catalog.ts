import { EditalFonte } from '../edital-fonte.enum';

// Catálogo configurável do que conta como "edital de obra" (CLAUDE.md §3.3).
// Regra de negócio CENTRALIZADA aqui — não espalhe esse critério pelo código.
// Ajuste estas listas para afinar o filtro. (Pode virar config em banco depois.)

// Modalidades de obra POR FONTE — `modalidadeId` é numerado por cada fonte,
// então o mapeamento é específico de cada uma (PNCP ≠ Compras.gov.br).
export const OBRA_MODALIDADES: Record<EditalFonte, number[]> = {
  [EditalFonte.PNCP]: [4, 5], // Concorrência (Eletrônica e Presencial)
};

// Palavras no objeto que INCLUEM como obra (já normalizadas: minúsculas, sem
// acento, em stems). Cobrem execução de obra/engenharia. Aprendizado do spike:
// incluir "infraestrutura" e "implantacao" — um caso real de obra só batia por eles.
export const OBRA_INCLUSION_KEYWORDS = [
  'obra',
  'construc',
  'reforma',
  'pavimenta',
  'recapea',
  'edifica',
  'engenharia',
  'drenagem',
  'dragagem',
  'saneamento',
  'urbaniza',
  'revitaliza',
  'ampliacao',
  'calcament',
  'ponte',
  'passarela',
  'muro de contencao',
  'quadra',
  'reservatorio',
  'galeria',
  'terraplanagem',
  'infraestrutura',
  'implantacao',
  'esgoto',
  'iluminacao publica',
  'ciclovia',
];

// Palavras que EXCLUEM (não-obra, mesmo dentro de modalidade de obra). Mantidas
// CONSERVADORAS para não derrubar obra de verdade (favor recall). Tira sobretudo
// serviços e fornecimentos claramente não-construtivos.
export const OBRA_EXCLUSION_KEYWORDS = [
  'locacao',
  'aluguel',
  'limpeza',
  'coleta de residuos',
  'coleta de lixo',
  'vigilancia',
  'seguranca patrimonial',
  'software',
  'licenca de uso',
  'consultoria',
  'capacitacao',
  'treinamento',
];
