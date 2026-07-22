import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { EditalExigencias } from '../src/editais/exigencias/edital-exigencias.entity';
import { EditalItensExtracao } from '../src/editais/itens/edital-itens-extracao.entity';
import { IaCustoService } from '../src/editais/ia-custo.service';

// porDia (T-190): soma o custo das DUAS tabelas por dia. Testa o merge — um dia
// que aparece nas duas soma; a ordem final é crescente por data.
function repoComDias(linhas: { dia: string; total: string }[]) {
  const qb = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue(linhas),
  };
  return { createQueryBuilder: jest.fn(() => qb) };
}

describe('IaCustoService.porDia (T-190)', () => {
  it('soma as duas tabelas por dia e ordena crescente', async () => {
    const exig = repoComDias([
      { dia: '2026-07-07', total: '1.5' },
      { dia: '2026-07-08', total: '2' },
    ]);
    const itens = repoComDias([{ dia: '2026-07-08', total: '0.5' }]);
    const service = new IaCustoService(
      exig as unknown as Repository<EditalExigencias>,
      itens as unknown as Repository<EditalItensExtracao>,
      { get: jest.fn() } as unknown as ConfigService,
    );

    const r = await service.porDia(14, new Date('2026-07-08T12:00:00Z'));
    expect(r).toEqual([
      { dia: '2026-07-07', total: 1.5 },
      { dia: '2026-07-08', total: 2.5 }, // 2 + 0.5
    ]);
  });
});
