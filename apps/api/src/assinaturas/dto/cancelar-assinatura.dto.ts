import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  MOTIVOS_CANCELAMENTO,
  MotivoCancelamento,
} from '../motivos-cancelamento';

// Corpo do cancelamento (T-217).
//
// O motivo é OBRIGATÓRIO — é o dado que a task existe para coletar, e pedir
// depois (por e-mail, por pesquisa) tem taxa de resposta perto de zero. O
// detalhe é opcional: quem quer explicar, explica.
export class CancelarAssinaturaDto {
  @IsIn(MOTIVOS_CANCELAMENTO as unknown as string[], {
    message: 'Escolha um motivo para o cancelamento.',
  })
  motivo!: MotivoCancelamento;

  // Teto igual ao da coluna (varchar 500). Sem ele, um texto grande viraria
  // erro 500 do Postgres em vez de 400 — foi o defeito da T-161, no cofre.
  @IsOptional()
  @IsString()
  @MaxLength(500)
  detalhe?: string;
}
