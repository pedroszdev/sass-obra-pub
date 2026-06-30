import {
  PropostaStatus,
  resolveDataEnvio,
} from '../src/propostas/proposta-status.enum';

// Regra da data de envio (T-84) — função pura, `now` injetado.
describe('resolveDataEnvio', () => {
  const now = new Date('2026-06-30T10:00:00Z');
  const antes = new Date('2026-06-01T12:00:00Z');

  it('rascunho → sempre null (limpa ao reabrir)', () => {
    expect(resolveDataEnvio(PropostaStatus.RASCUNHO, antes, now)).toBeNull();
    expect(resolveDataEnvio(PropostaStatus.RASCUNHO, null, now)).toBeNull();
  });

  it('enviada sem dataEnvio → grava now', () => {
    expect(resolveDataEnvio(PropostaStatus.ENVIADA, null, now)).toBe(now);
  });

  it('ganhou/nao_ganhou preservam a dataEnvio existente', () => {
    expect(resolveDataEnvio(PropostaStatus.GANHOU, antes, now)).toBe(antes);
    expect(resolveDataEnvio(PropostaStatus.NAO_GANHOU, antes, now)).toBe(antes);
  });

  it('vira resultado sem ter passado por enviada → grava now', () => {
    expect(resolveDataEnvio(PropostaStatus.GANHOU, null, now)).toBe(now);
  });
});
