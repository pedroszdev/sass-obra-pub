import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

// Validação de CNPJ com dígito verificador (T-153). Antes bastava "14 dígitos" —
// então 11111111111111 ou 14 dígitos aleatórios passavam. Aqui conferimos o DV
// (módulo 11), a mesma regra que a Receita usa. Só o formato NUMÉRICO clássico
// (decisão do dono); o CNPJ alfanumérico (jul/2026) fica fora por ora.

const PESOS_DV1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_DV2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

function digitoVerificador(base: string, pesos: number[]): number {
  let soma = 0;
  for (let i = 0; i < base.length; i++) {
    soma += Number(base[i]) * pesos[i];
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/** true se `valor` (com ou sem máscara) é um CNPJ numérico com DV válido. */
export function cnpjValido(valor: string): boolean {
  const cnpj = valor.replace(/\D/g, '');
  if (cnpj.length !== 14) return false;
  // Sequências de um dígito só (00000000000000, 11111111111111…) têm DV
  // "válido" pela conta, mas não são CNPJs reais — barramos explicitamente.
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const dv1 = digitoVerificador(cnpj.slice(0, 12), PESOS_DV1);
  const dv2 = digitoVerificador(cnpj.slice(0, 13), PESOS_DV2);
  return dv1 === Number(cnpj[12]) && dv2 === Number(cnpj[13]);
}

@ValidatorConstraint({ name: 'isCnpj', async: false })
class CnpjConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && cnpjValido(value);
  }
  defaultMessage(): string {
    return 'CNPJ inválido';
  }
}

/** Valida, num DTO, que o campo é um CNPJ numérico com DV correto (T-153). */
export function IsCnpj(options?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options,
      constraints: [],
      validator: CnpjConstraint,
    });
  };
}
