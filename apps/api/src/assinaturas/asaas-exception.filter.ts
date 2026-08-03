import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { capturarErro } from '../common/observabilidade';
import { AsaasError } from './asaas-client';

/**
 * Traduz `AsaasError` em resposta HTTP — Épico 17.
 *
 * 🔴 **Por que existe:** `AsaasError` é um `Error` comum, não um
 * `HttpException`. Sem isto o Nest não reconhece a classe e devolve **500** para
 * QUALQUER falha do provedor — inclusive as que são recado para o cliente.
 * Cartão recusado pelo emissor, cartão vencido, CPF/CNPJ inválido, troca de
 * cartão numa assinatura de boleto: tudo chegava à tela como *"Instabilidade no
 * servidor. Tente de novo em instantes."* (a `MSG_SERVIDOR` do front, aplicada a
 * todo 5xx), mandando a pessoa repetir uma operação que nunca ia passar. O
 * motivo real, que o Asaas manda por escrito e em português, morria no log.
 *
 * ── O mapeamento, e por que ele NÃO é "repassa o status" ──
 *
 * Só o **400** vira erro do cliente. O resto vira **503**, porque o resto não é
 * culpa de quem está na tela — é nossa ou do provedor, e o cliente não tem o que
 * fazer com esse detalhe. Repassar cru seria pior que o 500 que estamos
 * consertando:
 *
 * 🔴 **401/403 do Asaas é a NOSSA chave errada, e devolvê-lo como 401 seria um
 * bug sério:** o cliente de API do front trata 401 como sessão expirada, tenta
 * refresh e pode DESLOGAR o usuário. Uma chave mal configurada derrubaria a
 * sessão de quem tentou pagar.
 *
 * **429 do Asaas é a NOSSA cota**, não o rate limit dele contra este usuário —
 * como 429 a tela diria "muitas tentativas em pouco tempo" a quem tentou uma vez.
 *
 * **404** é assinatura que não existe do lado de lá: divergência de estado
 * nossa, que a reconciliação (T-223) conserta, não um recurso que o cliente
 * pediu errado.
 *
 * ⚠️ **A mensagem repassada no 400 é a `description` do Asaas** — texto
 * autorado pelo provedor, nunca eco do nosso corpo de requisição. Isso importa
 * aqui mais que em qualquer outro lugar: as rotas que mais produzem 400 são as
 * que **recebem cartão**, e ecoar corpo seria PAN na resposta (SAQ A-EP).
 *
 * ⚠️ Aplicado por CONTROLLER (`@UseFilters`), não global: assim não disputa
 * ordem com o `SentryGlobalFilter` e não altera o comportamento dos webhooks,
 * que respondem por regra própria.
 */
/**
 * O mapeamento, puro e testável à parte do filtro.
 *
 * `ehDoCliente` responde "isto é recado para quem está na tela?" — é o que
 * decide se vai ao Sentry. Cartão recusado não é incidente; chave de API errada
 * é.
 */
export function traduzirErroAsaas(erro: AsaasError): {
  excecao: HttpException;
  ehDoCliente: boolean;
} {
  if (erro.status === 400) {
    return {
      excecao: new BadRequestException(erro.message),
      ehDoCliente: true,
    };
  }
  return {
    excecao: new ServiceUnavailableException(
      'O provedor de pagamento não respondeu como esperado. Tente de novo em instantes.',
    ),
    ehDoCliente: false,
  };
}

@Catch(AsaasError)
export class AsaasExceptionFilter
  extends BaseExceptionFilter
  implements ExceptionFilter
{
  private readonly logger = new Logger(AsaasExceptionFilter.name);

  catch(erro: AsaasError, host: ArgumentsHost): void {
    const { excecao, ehDoCliente } = traduzirErroAsaas(erro);
    if (!ehDoCliente) {
      // Problema NOSSO ou do provedor — precisa ser visto. O log guarda status e
      // códigos do Asaas, que é o que permite distinguir chave errada (401) de
      // indisponibilidade (5xx) sem reproduzir.
      this.logger.error(
        `Asaas respondeu ${erro.status} [${erro.codigos.join(', ') || 'sem código'}]: ${erro.message}`,
      );
      capturarErro(erro, 'asaas', {
        status: erro.status,
        codigos: erro.codigos,
      });
    }
    super.catch(excecao, host);
  }
}
