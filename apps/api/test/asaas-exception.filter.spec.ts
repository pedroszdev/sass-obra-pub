import { HttpStatus } from '@nestjs/common';
import { AsaasError } from '../src/assinaturas/asaas-client';
import { traduzirErroAsaas } from '../src/assinaturas/asaas-exception.filter';

// Tradução de erro do Asaas em resposta HTTP.
//
// Sem isto, `AsaasError` (que é um Error comum, não HttpException) virava 500 —
// e o front traduz TODO 5xx para "Instabilidade no servidor. Tente de novo em
// instantes.", mandando a pessoa repetir o que nunca ia passar.

function erro(status: number, mensagem = 'motivo do provedor'): AsaasError {
  return new AsaasError(status, ['codigo_asaas'], mensagem);
}

describe('traduzirErroAsaas', () => {
  it('400 vira 400 e REPASSA o motivo do provedor', () => {
    const { excecao, ehDoCliente } = traduzirErroAsaas(
      erro(400, 'Cartão de crédito recusado pelo emissor.'),
    );
    expect(excecao.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(excecao.message).toBe('Cartão de crédito recusado pelo emissor.');
    // Recado para o cliente, não incidente: cartão recusado no Sentry enterra
    // os incidentes de verdade.
    expect(ehDoCliente).toBe(true);
  });

  describe('o que NÃO pode ser repassado cru', () => {
    // 🔴 O mais importante: o cliente de API do front trata 401 como sessão
    // expirada, tenta refresh e pode DESLOGAR. Uma chave de API mal configurada
    // derrubaria a sessão de quem tentou pagar.
    it('401/403 (nossa chave errada) NUNCA vira 401/403', () => {
      for (const status of [401, 403]) {
        const { excecao } = traduzirErroAsaas(erro(status));
        expect(excecao.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      }
    });

    it('429 (nossa cota no provedor) não vira 429', () => {
      // Como 429 a tela diria "muitas tentativas em pouco tempo" a quem tentou
      // uma vez só.
      const { excecao } = traduzirErroAsaas(erro(429));
      expect(excecao.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    });

    it('404 (divergência de estado nossa) não vira 404', () => {
      const { excecao } = traduzirErroAsaas(erro(404));
      expect(excecao.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    });

    it('5xx do provedor vira 503', () => {
      for (const status of [500, 502, 503]) {
        expect(traduzirErroAsaas(erro(status)).excecao.getStatus()).toBe(
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
    });
  });

  it('o que não é 400 é reportado, e não vaza o texto do provedor', () => {
    const { excecao, ehDoCliente } = traduzirErroAsaas(
      erro(401, 'invalid api key for account 12345'),
    );
    expect(ehDoCliente).toBe(false);
    expect(excecao.message).not.toMatch(/api key|12345/i);
    expect(excecao.message).toMatch(/provedor de pagamento/i);
  });
});
