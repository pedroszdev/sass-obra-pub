import { soDigitos } from './cadastro';

// Máscaras e validação do formulário de cartão (Épico 17). Funções PURAS e
// testadas — a mesma disciplina do `cadastro.ts`, porque campo de pagamento
// digitado errado é venda perdida.
//
// ⚠️ Nada aqui GUARDA cartão: são transformações de string em memória, usadas
// só enquanto o modal está aberto (escopo PCI SAQ A-EP, §9).

/** Bandeiras que sabemos reconhecer pelo início do número. */
export type Bandeira = 'visa' | 'mastercard' | 'amex' | 'elo' | 'hipercard' | null;

/**
 * Bandeira pelo prefixo. Serve para MOSTRAR ao usuário e ajustar o CVV (Amex
 * tem 4 dígitos) — quem valida de verdade é o emissor.
 */
export function bandeiraDoNumero(valor: string): Bandeira {
  const d = soDigitos(valor);
  if (/^4/.test(d)) return 'visa';
  if (/^(5[1-5]|2[2-7])/.test(d)) return 'mastercard';
  if (/^3[47]/.test(d)) return 'amex';
  if (/^(4011|4312|4389|5041|5067|6277|6362|650)/.test(d)) return 'elo';
  if (/^(606282|3841)/.test(d)) return 'hipercard';
  return null;
}

/** Amex usa 15 dígitos e CVV de 4; o resto, 16 e 3. */
export function tamanhoDoNumero(bandeira: Bandeira): number {
  return bandeira === 'amex' ? 15 : 16;
}

export function tamanhoDoCvv(bandeira: Bandeira): number {
  return bandeira === 'amex' ? 4 : 3;
}

/** `4444444444444444` → `4444 4444 4444 4444` (Amex agrupa 4-6-5). */
export function formatarNumeroCartao(valor: string): string {
  const bandeira = bandeiraDoNumero(valor);
  const d = soDigitos(valor).slice(0, tamanhoDoNumero(bandeira));
  const grupos =
    bandeira === 'amex'
      ? [d.slice(0, 4), d.slice(4, 10), d.slice(10, 15)]
      : [d.slice(0, 4), d.slice(4, 8), d.slice(8, 12), d.slice(12, 16)];
  return grupos.filter(Boolean).join(' ');
}

/**
 * `1230` → `12/30`. Um campo só, como em todo checkout — e é o que está
 * impresso no cartão, então o usuário não precisa traduzir nada.
 */
export function formatarValidade(valor: string): string {
  const d = soDigitos(valor).slice(0, 4);
  if (d.length <= 2) return d;
  return `${d.slice(0, 2)}/${d.slice(2)}`;
}

/**
 * Quebra `MM/AA` no que a API espera. Ano de 2 dígitos vira 20XX — não existe
 * cartão válido de 1900, e adivinhar o século aqui evita um campo a mais.
 */
export function partesDaValidade(valor: string): {
  mes: string;
  ano: string;
} | null {
  const d = soDigitos(valor);
  if (d.length !== 4) return null;
  const mes = d.slice(0, 2);
  if (Number(mes) < 1 || Number(mes) > 12) return null;
  return { mes, ano: `20${d.slice(2)}` };
}

/** Validade no passado é o erro mais comum — e o emissor só diria depois. */
export function validadeExpirada(valor: string, hoje = new Date()): boolean {
  const partes = partesDaValidade(valor);
  if (!partes) return false;
  const ano = Number(partes.ano);
  const mes = Number(partes.mes);
  const anoAtual = hoje.getFullYear();
  const mesAtual = hoje.getMonth() + 1;
  return ano < anoAtual || (ano === anoAtual && mes < mesAtual);
}

/** `89010000` → `89010-000`. */
export function formatarCep(valor: string): string {
  const d = soDigitos(valor).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

/**
 * Comprimento plausível para a bandeira. **NÃO validamos Luhn**, e isso é
 * decisão medida, não descuido: o cartão de teste do sandbox do Asaas
 * (`4444 4444 4444 4444`) **não passa no Luhn** — a soma dá 96. Bloquear por
 * Luhn tornaria o ambiente de teste inutilizável, e em produção o emissor
 * recusa de qualquer jeito. Comprimento pega o erro grosseiro; o resto é com
 * quem cobra.
 */
export function numeroCartaoPlausivel(valor: string): boolean {
  const d = soDigitos(valor);
  const bandeira = bandeiraDoNumero(d);
  return d.length === tamanhoDoNumero(bandeira);
}

/**
 * Luhn — o dígito verificador do cartão.
 *
 * ⚠️ **USADO COMO AVISO, NÃO COMO BLOQUEIO**, e a razão é medida: o cartão de
 * teste do sandbox do Asaas (`4444 4444 4444 4444`) **não passa no Luhn** — a
 * soma dá 96. Bloquear tornaria o ambiente de teste inutilizável justamente no
 * caminho feliz. Como aviso, ele faz o trabalho que interessa: pega o dígito
 * trocado antes de o cliente levar uma recusa do emissor, que é lenta e
 * assustadora. Quem decide de verdade é quem cobra.
 */
export function passaNoLuhn(valor: string): boolean {
  const d = soDigitos(valor);
  if (d.length < 13) return true; // ainda digitando: não é hora de avisar
  let soma = 0;
  let dobra = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = Number(d[i]);
    if (dobra) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    soma += n;
    dobra = !dobra;
  }
  return soma % 10 === 0;
}
