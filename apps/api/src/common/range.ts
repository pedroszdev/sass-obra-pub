import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

// Validação cruzada de campos (T-168): um filtro de faixa com mínimo > máximo
// devolveria vazio em silêncio. O front já avisa, mas o backend é a fonte da
// verdade (§5) — aqui garantimos que `valorMax >= valorMin` no DTO.

@ValidatorConstraint({ name: 'isGteField', async: false })
class GteFieldConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const outro = (args.object as Record<string, unknown>)[
      args.constraints[0] as string
    ];
    // Só compara quando os DOIS são números. Ausência/tipo é problema de outras
    // regras (@IsOptional/@IsNumber) — aqui não duplicamos esse erro.
    if (typeof value !== 'number' || typeof outro !== 'number') return true;
    return value >= outro;
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} deve ser maior ou igual a ${args.constraints[0] as string}`;
  }
}

/**
 * Valida que este campo numérico é >= outro campo numérico do mesmo objeto.
 * Só dispara quando ambos estão presentes e são números.
 */
export function IsGteField(property: string, options?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options,
      constraints: [property],
      validator: GteFieldConstraint,
    });
  };
}
