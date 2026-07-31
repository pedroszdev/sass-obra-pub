import { Type } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { IsCnpj } from '../../common/cnpj';

// Troca do cartão da assinatura (Épico 17).
//
// 🔴 ESTE DTO CARREGA DADO DE CARTÃO. Decisão do dono (31/07): aceitar o escopo
// PCI **SAQ A-EP** para ter troca de cartão self-service — sem ela, cartão
// vencido não tinha conserto e o cliente caía em `past_due` sem saída.
//
// REGRAS QUE NÃO SE QUEBRAM neste caminho:
//   1. **NADA daqui é persistido.** Nem número, nem CVV, nem validade. O que
//      guardamos é o que o Asaas devolve: últimos 4 e bandeira.
//   2. **NADA daqui vai para log.** Nem em erro, nem em Sentry — o
//      `capturarErro` não pode receber este objeto.
//   3. **Nada volta na resposta.** O endpoint devolve o mascarado do provedor.
//   4. O `ValidationPipe` global tem `forbidNonWhitelisted`, então campo extra é
//      rejeitado antes de chegar aqui — não vire "aceita qualquer coisa".
export class CartaoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  holderName!: string;

  // Só dígitos, 13 a 19 — a faixa real dos cartões (Visa 13/16, Amex 15,
  // Mastercard 16, alguns 19). Não validamos Luhn: quem recusa é o emissor, e
  // um Luhn nosso só adiantaria a mensagem de erro.
  @Matches(/^\d{13,19}$/, { message: 'Número de cartão inválido' })
  number!: string;

  @Matches(/^(0[1-9]|1[0-2])$/, { message: 'Mês de validade inválido' })
  expiryMonth!: string;

  @Matches(/^\d{4}$/, { message: 'Ano de validade inválido (AAAA)' })
  expiryYear!: string;

  @Matches(/^\d{3,4}$/, { message: 'CVV inválido' })
  ccv!: string;
}

export class TitularDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsEmail()
  @MaxLength(255)
  email!: string;

  // O titular do cartão pode ser a empresa; o CNPJ é o que vai para a nota.
  @IsCnpj()
  cpfCnpj!: string;

  @Matches(/^\d{8}$/, { message: 'CEP inválido (8 dígitos)' })
  postalCode!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  addressNumber!: string;

  @Matches(/^\d{10,11}$/, { message: 'Telefone inválido (DDD + número)' })
  phone!: string;
}

export class TrocarCartaoDto {
  @ValidateNested()
  @Type(() => CartaoDto)
  cartao!: CartaoDto;

  @ValidateNested()
  @Type(() => TitularDto)
  titular!: TitularDto;
}
