import { IsOptional, IsString, MaxLength } from 'class-validator';

// Marcação de NFS-e emitida à mão (T-219). O número é OPCIONAL: o que o alerta
// precisa é saber que a obrigação foi cumprida; anotar o número é conveniência
// de conferência depois, e exigi-lo faria o dono adiar a marcação.
export class MarcarNfseDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  numero?: string;
}
