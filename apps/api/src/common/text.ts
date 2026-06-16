// Normaliza texto para comparação: minúsculas e sem acentos.
// Usado pela classificação de obra e pela busca de municípios — os dois
// precisam normalizar igual para casar.
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}
