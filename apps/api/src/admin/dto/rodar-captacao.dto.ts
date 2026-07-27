import { ArrayMaxSize, IsArray, IsIn, IsOptional } from 'class-validator';
import { Uf, UFS } from '../../common/uf';

// Disparo manual da captação (T-188). `ufs` opcional: quando vem, capta SÓ essas
// UFs (o dono pré-aquece uma região); ausente/vazio = orientado à demanda (T-34).
export class RodarCaptacaoDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(27)
  @IsIn(UFS, { each: true })
  ufs?: Uf[];
}
