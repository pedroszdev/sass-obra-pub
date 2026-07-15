import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

// Política de senha forte (T-153). Fonte da verdade da regra — o front (lib/senha)
// espelha estes mesmos requisitos só para dar feedback ao vivo; quem barra de fato
// é o backend, aqui.
//
// Regra (decisão do dono): 8 a 72 caracteres, com MAIÚSCULA, minúscula, número e
// caractere especial. O teto de 72 é do bcrypt — acima disso ele TRUNCA, o que
// daria falsa sensação de força.

export const SENHA_MIN = 8;
export const SENHA_MAX = 72;

export const SENHA_MENSAGEM =
  'A senha precisa de 8 a 72 caracteres, com letra maiúscula, minúscula, número e caractere especial.';

export interface RequisitosSenha {
  tamanho: boolean;
  maiuscula: boolean;
  minuscula: boolean;
  numero: boolean;
  especial: boolean;
}

export function requisitosSenha(senha: string): RequisitosSenha {
  return {
    tamanho: senha.length >= SENHA_MIN && senha.length <= SENHA_MAX,
    maiuscula: /[A-Z]/.test(senha),
    minuscula: /[a-z]/.test(senha),
    numero: /[0-9]/.test(senha),
    // "Especial" = qualquer coisa que não seja letra ASCII ou dígito.
    especial: /[^A-Za-z0-9]/.test(senha),
  };
}

export function senhaForte(senha: string): boolean {
  const r = requisitosSenha(senha);
  return r.tamanho && r.maiuscula && r.minuscula && r.numero && r.especial;
}

@ValidatorConstraint({ name: 'isSenhaForte', async: false })
class SenhaForteConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && senhaForte(value);
  }
  defaultMessage(): string {
    return SENHA_MENSAGEM;
  }
}

/** Valida, num DTO, que o campo é uma senha que atende à política (T-153). */
export function IsSenhaForte(options?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options,
      constraints: [],
      validator: SenhaForteConstraint,
    });
  };
}
