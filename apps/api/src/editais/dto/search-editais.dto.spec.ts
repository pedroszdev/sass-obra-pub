import { ValidationPipe } from '@nestjs/common';
import { SearchEditaisDto } from './search-editais.dto';

// Passa os params crus pela MESMA ValidationPipe do main.ts (transform +
// whitelist), para o teste refletir o que a query da busca sofre em produção.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

const meta = {
  type: 'query' as const,
  metatype: SearchEditaisDto,
  data: '',
};

async function validar(query: Record<string, unknown>) {
  return pipe.transform(query, meta) as Promise<SearchEditaisDto>;
}

describe('SearchEditaisDto — faixa de valor (T-168)', () => {
  it('aceita mín <= máx', async () => {
    const dto = await validar({ valorMin: '1000', valorMax: '5000' });
    expect(dto.valorMin).toBe(1000);
    expect(dto.valorMax).toBe(5000);
  });

  it('aceita mín == máx', async () => {
    const dto = await validar({ valorMin: '5000', valorMax: '5000' });
    expect(dto.valorMax).toBe(5000);
  });

  it('rejeita a faixa invertida (mín > máx)', async () => {
    expect.assertions(2);
    try {
      await validar({ valorMin: '5000', valorMax: '1000' });
    } catch (err) {
      // A ValidationPipe lança BadRequestException; a mensagem detalhada fica
      // no corpo (`response.message`), não no `.message` genérico.
      const resposta = (
        err as { getResponse: () => { message: string[] } }
      ).getResponse();
      expect(Array.isArray(resposta.message)).toBe(true);
      expect(resposta.message).toContain(
        'valorMax deve ser maior ou igual a valorMin',
      );
    }
  });

  it('só valorMin (sem máx) passa — sem comparação cruzada', async () => {
    const dto = await validar({ valorMin: '5000' });
    expect(dto.valorMin).toBe(5000);
    expect(dto.valorMax).toBeUndefined();
  });

  it('só valorMax (sem mín) passa', async () => {
    const dto = await validar({ valorMax: '1000' });
    expect(dto.valorMax).toBe(1000);
    expect(dto.valorMin).toBeUndefined();
  });
});
