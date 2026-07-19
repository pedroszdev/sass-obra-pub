import { ValidationPipe } from '@nestjs/common';
import { UpsertCompanyProfileDto } from './upsert-company-profile.dto';

// Passa o corpo pela MESMA ValidationPipe do main.ts, para refletir produção.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

const meta = {
  type: 'body' as const,
  metatype: UpsertCompanyProfileDto,
  data: '',
};

const validar = (body: Record<string, unknown>) =>
  pipe.transform(body, meta) as Promise<UpsertCompanyProfileDto>;

async function mensagensDeErro(
  body: Record<string, unknown>,
): Promise<string[]> {
  try {
    await validar(body);
    return [];
  } catch (err) {
    return (err as { getResponse: () => { message: string[] } }).getResponse()
      .message;
  }
}

describe('UpsertCompanyProfileDto — telefone (T-172)', () => {
  it('aceita a máscara com DDD', async () => {
    const dto = await validar({ telefone: '(11) 98765-4321' });
    expect(dto.telefone).toBe('(11) 98765-4321');
  });

  it('aceita só dígitos', async () => {
    const dto = await validar({ telefone: '11987654321' });
    expect(dto.telefone).toBe('11987654321');
  });

  it('aceita vazio (limpar o campo)', async () => {
    const dto = await validar({ telefone: '' });
    expect(dto.telefone).toBe('');
  });

  it('rejeita letras', async () => {
    expect(await mensagensDeErro({ telefone: 'liga pra mim' })).toContain(
      'telefone deve conter apenas números e a máscara (DDD).',
    );
  });
});
