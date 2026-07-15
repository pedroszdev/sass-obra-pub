// Helpers puros do cadastro self-service (T-100). Validação espelha o RegisterDto
// do backend (senha forte, cnpj com DV válido se informado, uf obrigatória) — o
// front valida antes de enviar para dar erro rápido, mas o backend é a fonte da
// verdade.

import { senhaForte } from './senha';

/** Só os dígitos de uma string (para o CNPJ, que o usuário digita com máscara). */
export function soDigitos(valor: string): string {
  return valor.replace(/\D/g, '');
}

// Dígito verificador (módulo 11) do CNPJ numérico — espelha common/cnpj.ts no
// backend. Barra 11111111111111 e 14 dígitos aleatórios, que antes passavam.
const PESOS_DV1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_DV2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

function dv(base: string, pesos: number[]): number {
  let soma = 0;
  for (let i = 0; i < base.length; i++) soma += Number(base[i]) * pesos[i];
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/** true se `valor` (com ou sem máscara) é um CNPJ numérico com DV válido. */
export function cnpjValido(valor: string): boolean {
  const cnpj = soDigitos(valor);
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false; // sequências de um dígito só
  return (
    dv(cnpj.slice(0, 12), PESOS_DV1) === Number(cnpj[12]) &&
    dv(cnpj.slice(0, 13), PESOS_DV2) === Number(cnpj[13])
  );
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
  if (!senhaForte(form.password)) {
    erros.password = 'A senha não atende aos requisitos abaixo.';
  }
  if (!form.uf) {
    erros.uf = 'Escolha o estado da sua empresa.';
  }
  const cnpjDigitos = soDigitos(form.cnpj);
  if (cnpjDigitos.length > 0 && !cnpjValido(form.cnpj)) {
    erros.cnpj = 'CNPJ inválido. Confira os números (ou deixe em branco).';
  }

  return erros;
}
