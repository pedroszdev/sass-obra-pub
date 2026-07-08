import { Transform } from 'class-transformer';
import {
  Equals,
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UFS, Uf } from '../../common/uf';
import { CompanyPorte } from '../../users/company-porte.enum';

export class RegisterDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;

  // bcrypt trunca acima de 72 bytes — limitamos para não dar falsa sensação de força.
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name!: string;

  // Região do empreiteiro (UF). Obrigatória — é o alvo da captação por região.
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsIn(UFS)
  uf!: Uf;

  // CNPJ opcional, só dígitos (14). `role` é intencionalmente ausente:
  // o cadastro nunca define papel (evita escalonamento de privilégio).
  @IsOptional()
  @Matches(/^\d{14}$/, { message: 'cnpj deve conter 14 dígitos' })
  cnpj?: string;

  @IsOptional()
  @IsEnum(CompanyPorte)
  porte?: CompanyPorte;

  // Consentimento LGPD (T-102): o cadastro só prossegue com o aceite dos Termos
  // + Política de Privacidade. `@Equals(true)` rejeita false/ausente.
  @Equals(true, {
    message: 'É preciso aceitar os Termos e a Política de Privacidade',
  })
  aceiteTermos!: boolean;
}
