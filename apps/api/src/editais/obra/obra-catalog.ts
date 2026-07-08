import { EditalFonte } from '../edital-fonte.enum';

// Catálogo configurável do que conta como "edital de obra" (CLAUDE.md §3.3).
// Regra de negócio CENTRALIZADA aqui — não espalhe esse critério pelo código.
// Ajuste estas listas para afinar o filtro. (Pode virar config em banco depois.)
//
// Todas as palavras já vêm NORMALIZADAS (minúsculas, sem acento) para casar com
// `normalizeText`. O classificador (obra-classifier.ts) casa por LIMITE DE
// PALAVRA (T-125) — então stems ancoram no início da palavra: `pavimenta` pega
// "pavimentacao"/"pavimentar", mas `\bconstruc` NÃO pega "reconstrucao".

// Modalidades de obra POR FONTE — `modalidadeId` é numerado por cada fonte,
// então o mapeamento é específico de cada uma (PNCP ≠ Compras.gov.br).
// Concorrência (4/5) é quase 100% obra → basta a modalidade (favor recall).
// Pregão/Dispensa (6/8) NÃO entram aqui: são maioria não-obra, então dependem
// de sinal FORTE no objeto (T-113/T-125). A expansão de captação é faseada.
export const OBRA_MODALIDADES: Record<EditalFonte, number[]> = {
  [EditalFonte.PNCP]: [4, 5], // Concorrência (Eletrônica e Presencial)
};

// Padrões NEGATIVOS removidos do texto ANTES de casar os positivos (T-125). São
// as armadilhas medidas no T-113: a palavra de obra aparece dentro de uma
// expressão que é compra/serviço, não execução. Ex.: "aquisição de MATERIAIS DE
// CONSTRUÇÃO" (compra) e "MÃO DE OBRA para desmontagem" (serviço). Ao apagá-los,
// "construção de escola" e "execução de obra" seguem casando; os falsos não.
export const OBRA_NEGATIVE_PATTERNS = [
  'mao de obra',
  'materiais de construcao',
  'material de construcao',
];

// Sinais FORTES de execução de obra — decidem obra SOZINHOS, em qualquer
// modalidade (e vencem a exclusão: "construção da sede da Vigilância"). Nouns/
// verbos inequívocos de construção. Stems ancorados no início da palavra.
export const OBRA_STRONG_KEYWORDS = [
  'obra', // "obra"/"obras" (o "mao de obra" já foi removido)
  'construc', // construcao/construir/construtora
  'reconstruc',
  'reforma',
  'pavimenta', // pavimentacao/pavimentar
  'repavimenta',
  'recapeamento', // NÃO "recapea" (casa "recapagem de pneus")
  'edifica', // edificacao/edificar
  'terraplanagem',
  'terraplenagem',
  'calcament', // calcamento
  'dragagem',
  'muro de contencao',
  'passarela',
  'viaduto',
  'ciclovia',
  'urbaniza', // urbanizacao
  'revitaliza',
  'requalificacao',
  'quadra poliesportiva',
];

// Sinais FRACOS (T-125): substantivos de infraestrutura ambíguos que, sozinhos,
// casam demais fora da obra ("tubos para DRENAGEM", "INFRAESTRUTURA de TI",
// "Companhia de ENGENHARIA"). Só contam como obra quando (a) há um verbo de
// execução junto (OBRA_EXECUTION_VERBS), ou (b) é modalidade de obra
// (Concorrência, onde o fallback já resolve). Nunca decidem sozinhos.
// Nota: `ampliacao`/`implantacao` NÃO entram aqui — são verbos (ficam em
// OBRA_EXECUTION_VERBS); se estivessem aqui, "ampliação de X" se auto-satisfaria
// (fraca + verbo do mesmo lema) e classificaria qualquer coisa como obra.
export const OBRA_WEAK_KEYWORDS = [
  'drenagem',
  'galeria',
  'reservatorio',
  'saneamento',
  'esgoto',
  'rede de agua',
  'iluminacao publica',
  'infraestrutura',
  'engenharia', // "serviços de engenharia" só com verbo de execução junto
  'ponte',
];

// Verbos/intenção de EXECUÇÃO — genéricos demais para decidir sozinhos
// ("execução de serviços de limpeza"), mas que, junto de um sinal FRACO,
// confirmam a obra ("EXECUÇÃO DE rede de esgoto", "IMPLANTAÇÃO DE galeria").
export const OBRA_EXECUTION_VERBS = [
  'execucao de',
  'construcao de',
  'construcao da',
  'construcao do',
  'implantacao de',
  'ampliacao de',
  'reabilitacao de',
  'recuperacao de',
];

// Palavras que EXCLUEM (não-obra) — usadas SÓ no fallback de modalidade de obra
// (Concorrência sem sinal forte): tira serviço/fornecimento claramente não
// construtivo. Conservadoras para não derrubar obra (favor recall). Um sinal
// FORTE vence a exclusão (a checagem forte roda antes).
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
