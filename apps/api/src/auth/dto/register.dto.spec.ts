import { ValidationPipe } from '@nestjs/common';
import { RegisterDto } from './register.dto';

// Passa o corpo pela MESMA ValidationPipe do main.ts, para refletir produção.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

const meta = { type: 'body' as const, metatype: RegisterDto, data: '' };

const validar = (body: Record<string, unknown>) =>
  pipe.transform(body, meta) as Promise<RegisterDto>;

const VALIDO = {
  email: 'fulano@empresa.com.br',
  password: 'Senha!Forte1',
  name: 'Fulano da Silva',
  uf: 'SP',
  aceiteTermos: true,
};

// T-203: o token do Turnstile é lido pelo TurnstileGuard, mas PRECISA existir no
// DTO. Este spec existe porque nenhum e2e passa pelo /auth/register: sem ele, a
// armadilha do `forbidNonWhitelisted` só apareceria em produção, como "cadastro
// devolve 400 e ninguém consegue criar conta".
describe('RegisterDto × turnstileToken (T-203)', () => {
  it('aceita o token e o preserva depois do whitelist', async () => {
    const dto = await validar({ ...VALIDO, turnstileToken: 'abc.token' });
    expect(dto.turnstileToken).toBe('abc.token');
  });

  it('aceita a AUSÊNCIA do token (Turnstile desligado → front não manda)', async () => {
    const dto = await validar(VALIDO);
    expect(dto.turnstileToken).toBeUndefined();
  });

  it('recusa token acima do teto de 2048', async () => {
    await expect(
      validar({ ...VALIDO, turnstileToken: 'x'.repeat(2049) }),
    ).rejects.toThrow();
  });

  // Prova que o teste acima significa algo: o pipe REJEITA campo desconhecido, e
  // é por isso que declarar `turnstileToken` no DTO não é opcional.
  it('campo não declarado continua sendo rejeitado', async () => {
    await expect(
      validar({ ...VALIDO, 'cf-turnstile-response': 'abc' }),
    ).rejects.toThrow();
  });
});
