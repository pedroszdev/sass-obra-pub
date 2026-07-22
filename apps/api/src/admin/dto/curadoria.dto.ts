import { IsBoolean } from 'class-validator';

export class ClassificacaoDto {
  @IsBoolean()
  isObra!: boolean;
}

export class VisibilidadeDto {
  @IsBoolean()
  oculto!: boolean;
}
