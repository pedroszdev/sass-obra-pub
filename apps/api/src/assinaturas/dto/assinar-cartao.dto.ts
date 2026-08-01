import { Type } from 'class-transformer';
import { IsIn, IsOptional, ValidateNested } from 'class-validator';
import { Plano } from '../precos';
import { CartaoDto, TitularDto } from './trocar-cartao.dto';

// Assinar (ou reativar) com cartão — Épico 17, substituindo o checkout hospedado.
//
// 🔴 CARREGA DADO DE CARTÃO, e reusa `CartaoDto`/`TitularDto` de propósito: as
// regras de validação do cartão precisam ser **as mesmas** nos dois caminhos que
// o recebem. Duplicá-las seria criar a segunda versão que diverge no dia em que
// uma delas for corrigida — e num campo de pagamento isso vira recusa do
// emissor, que o cliente lê como "o site não funciona".
//
// As invariantes valem igual aqui: nada persistido, nada em log, nada na
// resposta além de últimos 4 + bandeira.
export class AssinarCartaoDto {
  // Ausente → mensal, mesmo default do checkout que este endpoint substituiu:
  // um front em cache não pode quebrar o caminho de pagar.
  @IsOptional()
  @IsIn(['mensal', 'anual'])
  plano?: Plano;

  @ValidateNested()
  @Type(() => CartaoDto)
  cartao!: CartaoDto;

  @ValidateNested()
  @Type(() => TitularDto)
  titular!: TitularDto;
}
