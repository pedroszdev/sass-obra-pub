import { Transform } from 'class-transformer';
import { IsCnpj } from '../../common/cnpj';

// Define o CNPJ da empresa (T-225). Espelha o `UfDto`: o cadastro local já exige
// CNPJ, mas a conta criada pelo Google nasce sem ele (`auth.service.ts` grava
// null) — e sem CNPJ não dá para criar cliente no Asaas (Épico 17), que exige
// CPF ou CNPJ. O onboarding (T-108) usa este endpoint para coletá-lo.
export class CnpjDto {
  // Só dígitos: o usuário digita com máscara (00.000.000/0000-00) e o servidor
  // não pode depender do formato que o front mandou. O `@IsCnpj` valida o DV.
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/\D/g, '') : value,
  )
  @IsCnpj()
  cnpj!: string;
}
