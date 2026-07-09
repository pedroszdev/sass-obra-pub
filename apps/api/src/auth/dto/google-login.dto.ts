import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class GoogleLoginDto {
  // id_token devolvido pelo Google Identity Services no front.
  @IsString()
  @MaxLength(4096)
  idToken!: string;

  // Consentimento LGPD (T-102). Só é exigido quando a conta é NOVA — quem já tem
  // conta está apenas logando e já aceitou antes. Por isso não é `@Equals(true)`
  // como no RegisterDto: a exigência vive no AuthService, que sabe se é cadastro.
  @IsOptional()
  @IsBoolean()
  aceiteTermos?: boolean;
}
