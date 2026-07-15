// Política de senha forte (T-153). Espelha o backend (common/senha.ts), que é a
// fonte da verdade — aqui só damos feedback ao vivo para o usuário digitando.
// Regra: 8 a 72 caracteres, com maiúscula, minúscula, número e caractere especial.

export const SENHA_MIN = 8;
export const SENHA_MAX = 72;

export interface RequisitoSenha {
  label: string;
  ok: boolean;
}

/** Cada requisito da política, com o rótulo e se a senha já o atende. */
export function requisitosSenha(senha: string): RequisitoSenha[] {
  return [
    { label: 'Pelo menos 8 caracteres', ok: senha.length >= SENHA_MIN },
    { label: 'Uma letra maiúscula', ok: /[A-Z]/.test(senha) },
    { label: 'Uma letra minúscula', ok: /[a-z]/.test(senha) },
    { label: 'Um número', ok: /[0-9]/.test(senha) },
    { label: 'Um caractere especial', ok: /[^A-Za-z0-9]/.test(senha) },
  ];
}

/** true quando a senha atende a TODOS os requisitos (e não estoura o teto). */
export function senhaForte(senha: string): boolean {
  return senha.length <= SENHA_MAX && requisitosSenha(senha).every((r) => r.ok);
}
