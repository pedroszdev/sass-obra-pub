import { IsOptional, IsString, MaxLength } from 'class-validator';

// Solicitação de reembolso (T-218). O motivo é OPCIONAL de propósito: dentro
// dos 7 dias do CDC o arrependimento não precisa ser justificado, e exigir
// explicação de quem exerce um direito é atrito indevido.
export class SolicitarReembolsoDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  motivo?: string;
}
