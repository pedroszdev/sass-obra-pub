import { IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

// Confirmação da exclusão de conta (T-102/LGPD). Prova de posse AGORA, não só de
// uma sessão aberta: senha para conta local, ou um id_token fresco do Google para
// conta sem senha (T-126). Exatamente um dos dois — nunca nenhum.
//
// `@ValidateIf` (não `@IsOptional`) para que `senha: null` vire 400, não 500 —
// mesma armadilha corrigida na T-117(e).
export class ExcluirContaDto {
  @ValidateIf((dto: ExcluirContaDto) => dto.idToken === undefined)
  @IsString()
  @MinLength(1)
  senha?: string;

  // Só para contas sem senha: o front reabre o Google e manda um id_token novo.
  @ValidateIf((dto: ExcluirContaDto) => dto.senha === undefined)
  @IsString()
  @MaxLength(4096)
  idToken?: string;
}
