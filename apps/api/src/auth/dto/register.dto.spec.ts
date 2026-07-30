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
  // CNPJ obrigatório desde a T-225 — sem ele este "corpo válido" não valida.
  cnpj: '11222333000181',
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

// T-225: o CNPJ deixou de ser opcional. O Asaas (Épico 17) exige CPF ou CNPJ
// para criar cliente, então conta sem ele é conta incobrável — e num B2B de obra
// pública o CNPJ é a identidade do cliente.
describe('RegisterDto × cnpj obrigatório (T-225)', () => {
  it('recusa cadastro SEM cnpj', async () => {
    const semCnpj = { ...VALIDO, cnpj: undefined };
    await expect(validar(semCnpj)).rejects.toThrow();
  });

  it('recusa cnpj com dígito verificador inválido', async () => {
    // Mesmo tamanho e formato do válido; só o DV está errado. Se este passar, a
    // validação virou "tem 14 dígitos" e deixou de valer.
    await expect(
      validar({ ...VALIDO, cnpj: '11222333000180' }),
    ).rejects.toThrow();
  });

  it('recusa cnpj vazio (o front mandar string vazia não é "não informou")', async () => {
    await expect(validar({ ...VALIDO, cnpj: '' })).rejects.toThrow();
  });

  it('aceita cnpj COM máscara e normaliza para só dígitos', async () => {
    // O usuário digita com máscara; o servidor não pode depender do formato que
    // o front mandou. É o `@Transform` que garante isso — sem ele, o valor com
    // pontuação seria gravado no banco e nunca casaria com uma busca por dígitos.
    const dto = await validar({ ...VALIDO, cnpj: '11.222.333/0001-81' });
    expect(dto.cnpj).toBe('11222333000181');
  });
});
