import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { assertOpsToken } from '../src/common/ops-token';

// Token dos ganchos de ops (captação, notificações, custo de IA). A comparação é
// em tempo constante (T-153): `!==` sai no primeiro byte diferente e vaza, pelo
// tempo, quantos caracteres o atacante já acertou.
describe('assertOpsToken (T-153)', () => {
  it('passa quando o token confere', () => {
    expect(() => assertOpsToken('segredo', 'segredo')).not.toThrow();
  });

  it('401 quando o token não confere', () => {
    expect(() => assertOpsToken('errado', 'segredo')).toThrow(
      UnauthorizedException,
    );
  });

  // Tamanhos diferentes não podem explodir: o timingSafeEqual exige buffers do
  // mesmo tamanho e LANÇA quando diferem — por isso comparamos os hashes. Um
  // TypeError aqui viraria 500 (e o tamanho do token vazaria pela exceção).
  it('401 (não 500) quando o token tem outro tamanho', () => {
    expect(() => assertOpsToken('x', 'segredo-bem-mais-longo')).toThrow(
      UnauthorizedException,
    );
    expect(() =>
      assertOpsToken('token-enorme-enviado-pelo-atacante', 'curto'),
    ).toThrow(UnauthorizedException);
  });

  it('401 quando o token não vem no header', () => {
    expect(() => assertOpsToken(undefined, 'segredo')).toThrow(
      UnauthorizedException,
    );
  });

  // Sem token no ambiente o gancho fica DESABILITADO — não "aberto".
  it('503 quando o gancho não está configurado', () => {
    expect(() => assertOpsToken('qualquer', undefined)).toThrow(
      ServiceUnavailableException,
    );
    expect(() => assertOpsToken(undefined, '')).toThrow(
      ServiceUnavailableException,
    );
  });
});
