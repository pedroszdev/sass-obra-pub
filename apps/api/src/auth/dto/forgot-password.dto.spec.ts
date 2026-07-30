import { ValidationPipe } from '@nestjs/common';
import { ForgotPasswordDto } from './forgot-password.dto';

// Mesma ValidationPipe do main.ts, para refletir produção.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

const meta = { type: 'body' as const, metatype: ForgotPasswordDto, data: '' };
const validar = (body: Record<string, unknown>) =>
  pipe.transform(body, meta) as Promise<ForgotPasswordDto>;

// T-203 no forgot-password: o campo é lido pelo TurnstileGuard, mas precisa estar
// no DTO — senão o `forbidNonWhitelisted` derruba a requisição inteira com 400 e
// ninguém consegue mais recuperar a senha. Nenhum e2e passa por esta rota.
describe('ForgotPasswordDto × turnstileToken (T-203)', () => {
  it('aceita o token e o preserva', async () => {
    const dto = await validar({
      email: 'fulano@empresa.com.br',
      turnstileToken: 'abc.token',
    });
    expect(dto.turnstileToken).toBe('abc.token');
  });

  it('aceita a ausência do token (Turnstile desligado)', async () => {
    const dto = await validar({ email: 'fulano@empresa.com.br' });
    expect(dto.turnstileToken).toBeUndefined();
  });

  it('recusa token acima do teto de 2048', async () => {
    await expect(
      validar({ email: 'a@b.com', turnstileToken: 'x'.repeat(2049) }),
    ).rejects.toThrow();
  });

  it('campo não declarado continua sendo rejeitado', async () => {
    await expect(
      validar({ email: 'a@b.com', 'cf-turnstile-response': 'abc' }),
    ).rejects.toThrow();
  });
});
