import {
  gerarTokenDescadastro,
  verificarTokenDescadastro,
} from '../src/notificacoes/descadastro-token';

// Token de descadastro (T-135): assinado, stateless. Se aceitar um token forjado,
// qualquer um descadastra a conta de outro; se rejeitar um válido, o link morre.
const SEGREDO = 'segredo-do-servidor';

describe('token de descadastro (T-135)', () => {
  it('ida e volta: o token válido devolve o userId', () => {
    const token = gerarTokenDescadastro('user-123', SEGREDO);
    expect(verificarTokenDescadastro(token, SEGREDO)).toBe('user-123');
  });

  it('segredo errado → null', () => {
    const token = gerarTokenDescadastro('user-123', SEGREDO);
    expect(verificarTokenDescadastro(token, 'outro')).toBeNull();
  });

  it('assinatura adulterada → null', () => {
    const token = gerarTokenDescadastro('user-123', SEGREDO);
    const [id] = token.split('.');
    expect(verificarTokenDescadastro(`${id}.falsa`, SEGREDO)).toBeNull();
  });

  it('formato inválido → null (sem crash)', () => {
    expect(verificarTokenDescadastro('', SEGREDO)).toBeNull();
    expect(verificarTokenDescadastro('sem-ponto', SEGREDO)).toBeNull();
  });
});
