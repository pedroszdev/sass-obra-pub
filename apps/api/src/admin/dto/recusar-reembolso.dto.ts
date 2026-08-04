import { IsString, MaxLength, MinLength } from 'class-validator';

// Recusa de reembolso (T-218). A justificativa é OBRIGATÓRIA — e não por
// burocracia: dentro dos 7 dias do CDC o reembolso é direito do cliente, e
// recusar ali é assumir risco jurídico. O texto volta para ele.
export class RecusarReembolsoDto {
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  nota!: string;
}
