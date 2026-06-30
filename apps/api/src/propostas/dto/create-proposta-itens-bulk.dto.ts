import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { CreatePropostaItemDto } from './create-proposta-item.dto';

// Inclusão em lote de itens na proposta (BACKLOG T-65 — fallback manual). Para
// o empreiteiro colar várias linhas de uma planilha quando a extração por IA
// não rolou. Os itens são adicionados ao fim, na ordem enviada.
export class CreatePropostaItensBulkDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => CreatePropostaItemDto)
  itens!: CreatePropostaItemDto[];
}
