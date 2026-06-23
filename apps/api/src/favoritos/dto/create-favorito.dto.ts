import { IsUUID } from 'class-validator';

export class CreateFavoritoDto {
  // Id do edital a salvar. UUID inválido → 400.
  @IsUUID()
  editalId!: string;
}
