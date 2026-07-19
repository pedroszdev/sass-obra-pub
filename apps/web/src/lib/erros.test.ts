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

  it('5xx nunca mostra o texto interno', () => {
    expect(amigavel(500, 'Internal server error')).toBe(
      amigavel(503, 'qualquer coisa'),
    );
    expect(amigavel(500, 'Internal server error')).not.toMatch(/internal/i);
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
