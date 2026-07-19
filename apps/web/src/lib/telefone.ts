// Máscara e validação de telefone BR (T-172). O campo aceitava letras e não dava
// feedback imediato. Aqui: só dígitos viram uma máscara "(XX) XXXXX-XXXX" (celular,
// 11 dígitos) ou "(XX) XXXX-XXXX" (fixo, 10). O backend segue validando (§5).

/** Só os dígitos de uma string (remove máscara, letras, espaços). */
export function soDigitos(valor: string): string {
  return valor.replace(/\D/g, '');
}

/**
 * Formata progressivamente enquanto digita. Aceita até 11 dígitos; acima disso,
 * ignora o excesso (o usuário não consegue "passar" do celular).
 */
export function formatarTelefone(valor: string): string {
  const d = soDigitos(valor).slice(0, 11);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  const ddd = d.slice(0, 2);
  const resto = d.slice(2);
  // Fixo (8 dígitos após o DDD → 10 no total): XXXX-XXXX.
  // Celular (9 dígitos após o DDD → 11): XXXXX-XXXX.
  const corte = resto.length > 8 ? 5 : 4;
  if (resto.length <= corte) return `(${ddd}) ${resto}`;
  return `(${ddd}) ${resto.slice(0, corte)}-${resto.slice(corte)}`;
}

/** true se tem 10 (fixo) ou 11 (celular) dígitos. Vazio é tratado à parte. */
export function telefoneValido(valor: string): boolean {
  const n = soDigitos(valor).length;
  return n === 10 || n === 11;
}
