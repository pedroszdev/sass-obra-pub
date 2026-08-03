import { describe, expect, it } from 'vitest';
import { amigavel } from './erros';

describe('amigavel (T-170)', () => {
  it('429 vira aviso de rate-limit, sem "ThrottlerException"', () => {
    const m = amigavel(429, 'ThrottlerException: Too Many Requests');
    expect(m).toMatch(/muitas tentativas/i);
    expect(m).not.toMatch(/throttler/i);
  });

  it('400 "uuid is expected" vira frase genérica, sem inglês', () => {
    const m = amigavel(400, 'Validation failed (uuid is expected)');
    expect(m).not.toMatch(/validation failed|uuid/i);
    expect(m).toMatch(/não foi possível/i);
  });

  it('5xx nunca mostra o texto interno do framework', () => {
    expect(amigavel(500, 'Internal server error')).not.toMatch(/internal/i);
    expect(amigavel(500, 'Internal server error')).toMatch(/instabilidade/i);
    expect(amigavel(503, 'Service Unavailable')).toMatch(/instabilidade/i);
  });

  // ⚠️ Mudança de comportamento (03/08). Antes, todo 5xx virava "Instabilidade
  // no servidor" ANTES de olhar o texto — e isso apagava as mensagens curadas de
  // 503, que é como o projeto sinaliza degradação proposital (§8). O cliente
  // recebia "tente de novo em instantes" para algo que só um humano resolve.
  it('503 com mensagem curada passa intacta', () => {
    const msg = 'Cobrança indisponível: preço da assinatura não configurado.';
    expect(amigavel(503, msg)).toBe(msg);
    expect(amigavel(503, 'O cartão foi enviado, mas o provedor não confirmou.')).toBe(
      'O cartão foi enviado, mas o provedor não confirmou.',
    );
  });

  it('5xx sem corpo legível cai em "instabilidade", não na genérica', () => {
    // 502/504 da borda vêm em HTML: o `extractMessage` sintetiza este texto, que
    // é NOSSO e não pode chegar à tela. E o fallback certo é instabilidade —
    // "verifique os dados" seria conselho errado quando o problema não é o dado.
    expect(amigavel(502, 'Erro 502 ao acessar /assinaturas/cartao.')).toMatch(
      /instabilidade/i,
    );
    expect(amigavel(500, '')).toMatch(/instabilidade/i);
  });

  it('400 do provedor de pagamento explica o motivo real', () => {
    // Sem o AsaasExceptionFilter isto era um 500 e virava "Instabilidade no
    // servidor", mandando repetir uma operação que nunca ia passar.
    expect(amigavel(400, 'Cartão de crédito recusado pelo emissor.')).toBe(
      'Cartão de crédito recusado pelo emissor.',
    );
  });

  it('mensagem de domínio em PT-BR passa intacta', () => {
    expect(amigavel(409, 'E-mail já cadastrado')).toBe('E-mail já cadastrado');
    expect(amigavel(403, 'Proposta fora de rascunho é somente leitura')).toBe(
      'Proposta fora de rascunho é somente leitura',
    );
    expect(amigavel(400, 'valorMax deve ser maior ou igual a valorMin')).toBe(
      'valorMax deve ser maior ou igual a valorMin',
    );
  });

  it('mensagem de validação padrão em inglês ("must be a number") é trocada', () => {
    expect(amigavel(400, 'valorMin must be a number')).toMatch(
      /não foi possível/i,
    );
  });

  it('corpo vazio cai na frase genérica', () => {
    expect(amigavel(400, '')).toMatch(/não foi possível/i);
  });
});
