import { IsNumber, IsString, Max, MaxLength, Min } from 'class-validator';

// Uma etapa do cronograma físico-financeiro simples (BACKLOG T-93). Só descrição
// + percentual; o valor é derivado do valor global no backend (§3.3).
export class EtapaCronogramaDto {
  @IsString()
  @MaxLength(255)
  descricao!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  percentual!: number;
}
