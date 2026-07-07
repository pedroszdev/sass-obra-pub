// Helpers puros do cadastro self-service (T-100). Validação espelha o RegisterDto
// do backend (senha ≥ 8, cnpj 14 dígitos se informado, uf obrigatória) — o front
// valida antes de enviar para dar erro rápido, mas o backend é a fonte da verdade.

/** Só os dígitos de uma string (para o CNPJ, que o usuário digita com máscara). */
export function soDigitos(valor: string): string {
  return valor.replace(/\D/g, '');
}

/** Máscara de exibição do CNPJ: 00.000.000/0000-00 (parcial enquanto digita). */
export function formatarCnpj(valor: string): string {
  const d = soDigitos(valor).slice(0, 14);
  const p = [
    d.slice(0, 2),
    d.slice(2, 5),
    d.slice(5, 8),
    d.slice(8, 12),
    d.slice(12, 14),
  ];
  let out = p[0];
  if (d.length > 2) out += `.${p[1]}`;
  if (d.length > 5) out += `.${p[2]}`;
  if (d.length > 8) out += `/${p[3]}`;
  if (d.length > 12) out += `-${p[4]}`;
  return out;
}

export interface RegistroForm {
  name: string;
  email: string;
  password: string;
  uf: string;
  cnpj: string; // com máscara/dígitos; vazio = não informado (opcional)
}

export type RegistroErros = Partial<Record<keyof RegistroForm, string>>;

// Valida o formulário; devolve um mapa campo→mensagem (vazio = tudo certo).
export function validarRegistro(form: RegistroForm): RegistroErros {
  const erros: RegistroErros = {};

  if (form.name.trim().length < 2) {
    erros.name = 'Informe seu nome.';
  }
  // Validação leve de e-mail (o backend faz a rigorosa) — só evita erro óbvio.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    erros.email = 'E-mail inválido.';
  }
  if (form.password.length < 8) {
    erros.password = 'A senha precisa de pelo menos 8 caracteres.';
  }
  if (!form.uf) {
    erros.uf = 'Escolha o estado da sua empresa.';
  }
  const cnpjDigitos = soDigitos(form.cnpj);
  if (cnpjDigitos.length > 0 && cnpjDigitos.length !== 14) {
    erros.cnpj = 'O CNPJ deve ter 14 dígitos (ou deixe em branco).';
  }

  return erros;
}
