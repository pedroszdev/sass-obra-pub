import { Transform } from 'class-transformer';
import {
  Equals,
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { IsCnpj } from '../../common/cnpj';
import { IsSenhaForte } from '../../common/senha';
import { UFS, Uf } from '../../common/uf';
import { CompanyPorte } from '../../users/company-porte.enum';

export class RegisterDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;

  // Política de senha forte (T-153): 8–72, maiúscula, minúscula, número e especial.
  // O teto de 72 é do bcrypt (trunca acima disso) e já vive dentro de @IsSenhaForte.
  @IsString()
  @IsSenhaForte()
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

  // CNPJ opcional, numérico com DV válido (T-153). `role` é intencionalmente
  // ausente: o cadastro nunca define papel (evita escalonamento de privilégio).
  @IsOptional()
  @IsCnpj()
  cnpj?: string;

  @IsOptional()
  @IsEnum(CompanyPorte)
  porte?: CompanyPorte;

  // Token do Turnstile (T-203). ⚠️ PRECISA estar declarado aqui mesmo sendo lido
  // pelo TurnstileGuard e não pelo service: o ValidationPipe global roda com
  // `forbidNonWhitelisted: true` (main.ts) e rejeitaria a requisição inteira com
  // 400 por "campo extra" se o front mandasse um campo que o DTO não conhece.
  // `@IsOptional()` porque a exigência é do guard, não do formato: sem
  // TURNSTILE_SECRET_KEY o front não emite token e o cadastro segue (§8).
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  turnstileToken?: string;

  // Consentimento LGPD (T-102): o cadastro só prossegue com o aceite dos Termos
  // + Política de Privacidade. `@Equals(true)` rejeita false/ausente.
  @Equals(true, {
    message: 'É preciso aceitar os Termos e a Política de Privacidade',
  })
  aceiteTermos!: boolean;
}
