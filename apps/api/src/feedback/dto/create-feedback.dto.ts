import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

// Reporte in-app (T-202). Só a mensagem é obrigatória; rota/versão são contexto.
export class CreateFeedbackDto {
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  mensagem!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  rota?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  versao?: string;
}
