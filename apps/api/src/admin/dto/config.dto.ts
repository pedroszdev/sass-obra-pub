import {
  IsBoolean,
  IsIn,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { BANNER_NIVEIS, BannerNivel } from '../../config/config-store.service';

// Banner global de aviso (T-195). Mensagem curta (é um aviso, não um artigo).
export class SetBannerDto {
  @IsBoolean()
  ativo!: boolean;

  @IsIn(BANNER_NIVEIS)
  nivel!: BannerNivel;

  @IsString()
  @MaxLength(280)
  mensagem!: string;
}

// Dias de trial editáveis (T-195). Clamp 1–90 também no service, defesa dupla.
export class SetTrialDiasDto {
  @IsInt()
  @Min(1)
  @Max(90)
  dias!: number;
}

// Versão vigente dos termos (T-196). String curta (ex.: "2026-07-27", "1.0").
// Vazia = versionamento desligado (ninguém é forçado a re-aceitar).
export class SetTermsVersionDto {
  @IsString()
  @MaxLength(40)
  versao!: string;
}

// Preço da assinatura (T-213). EM CENTAVOS — a mesma unidade do resto do
// projeto. A faixa aqui espelha o clamp do ConfigStoreService de propósito: o
// DTO barra o disparate na porta, e o store barra de novo, porque preço é
// caminho do dinheiro e uma camada só é pouco.
export class SetPrecosDto {
  @IsInt()
  @Min(100)
  @Max(1_000_000)
  mensalCentavos!: number;

  @IsInt()
  @Min(100)
  @Max(1_000_000)
  anualCentavos!: number;
}
