import { ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

// Reordenação dos itens de uma proposta (BACKLOG T-61). Traz TODOS os ids dos
// itens na nova ordem desejada; o service grava `ordem = índice`. O conjunto
// precisa bater exatamente com os itens da proposta (validado no service).
export class ReordenarItensDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  ordem!: string[];
}
