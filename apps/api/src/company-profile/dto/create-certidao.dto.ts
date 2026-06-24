import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { CertidaoTipo } from '../certidao-tipo.enum';

// Criação de uma certidão (BACKLOG T-41). `tipo` é obrigatório; quando OUTRA, a
// `descricao` passa a ser exigida — validado no service (regra de negócio).
export class CreateCertidaoDto {
  @IsEnum(CertidaoTipo)
  tipo!: CertidaoTipo;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  descricao?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  numero?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  orgaoEmissor?: string;

  // Coluna date — aceita 'YYYY-MM-DD' (ISO 8601). O service grava como veio.
  @IsOptional()
  @IsDateString()
  dataEmissao?: string;

  @IsOptional()
  @IsDateString()
  dataValidade?: string;
}
