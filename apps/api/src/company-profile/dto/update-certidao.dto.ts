import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { CertidaoTipo } from '../certidao-tipo.enum';

// Edição de certidão (BACKLOG T-41). Todos os campos opcionais — o PUT faz merge
// só do que for enviado. Escrito à mão (sem PartialType) para não trazer dep nova.
export class UpdateCertidaoDto {
  @IsOptional()
  @IsEnum(CertidaoTipo)
  tipo?: CertidaoTipo;

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

  @IsOptional()
  @IsDateString()
  dataEmissao?: string;

  @IsOptional()
  @IsDateString()
  dataValidade?: string;
}
