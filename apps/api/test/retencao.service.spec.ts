import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { Edital } from '../src/editais/edital.entity';
import { dataCorte, RetencaoService } from '../src/editais/retencao.service';

// Retenção (T-154). O risco desta rotina não é apagar de menos — é apagar DEMAIS:
// `favoritos` e `propostas` referenciam `editais` com ON DELETE CASCADE, então um
// DELETE descuidado levaria junto a proposta do empreiteiro (preços, BDI,
// cronograma). Os testes travam justamente a linha que separa lixo nosso de
// trabalho dele.

function build(
  env: Record<string, string> = {},
  linhas: unknown[][] = [[], []],
) {
  const query = jest.fn();
  for (const l of linhas) query.mockResolvedValueOnce(l);
  const editais = { query } as unknown as Repository<Edital>;
  const config = {
    get: jest.fn((k: string, def?: unknown) => env[k] ?? def),
  } as unknown as ConfigService;
  return { service: new RetencaoService(editais, config), query };
}

const ids = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `e${i}` }));

describe('dataCorte', () => {
  it('subtrai os dias do agora', () => {
    expect(dataCorte(new Date('2026-07-14T00:00:00Z'), 90)).toEqual(
      new Date('2026-04-15T00:00:00Z'),
    );
  });
});

describe('RetencaoService (T-154)', () => {
  it('só apaga edital SEM favorito e SEM proposta (o cascade mataria a proposta)', async () => {
    const { service, query } = build({}, [ids(3), []]);

    await service.executar(new Date('2026-07-14T00:00:00Z'));

    const sqlDelete = query.mock.calls[0][0] as string;
    expect(sqlDelete).toContain('DELETE FROM "editais"');
    // As duas guardas precisam estar no DELETE — sem elas, apagar o edital
    // apagaria em cascata o trabalho do usuário.
    expect(sqlDelete).toContain('NOT EXISTS (SELECT 1 FROM "favoritos"');
    expect(sqlDelete).toContain('NOT EXISTS (SELECT 1 FROM "propostas"');
  });

  // Encerrado + vinculado: a linha FICA (o usuário ainda vê a obra e a proposta);
  // só o dump cru — que é uso interno e o maior peso por linha — vai embora.
  it('no edital COM vínculo, zera só o raw_payload (não apaga a linha)', async () => {
    const { service, query } = build({}, [[], ids(5)]);

    const r = await service.executar(new Date('2026-07-14T00:00:00Z'));

    const sqlUpdate = query.mock.calls[1][0] as string;
    expect(sqlUpdate).toContain('UPDATE "editais"');
    expect(sqlUpdate).toContain('"raw_payload" = NULL');
    expect(sqlUpdate).toContain('NOT ('); // negação do "sem vínculo" = COM vínculo
    expect(r).toEqual({ removidos: 0, payloadsLimpos: 5 });
  });

  it('usa o corte de 90 dias por padrão, como parâmetro (não interpolado)', async () => {
    const { service, query } = build({}, [[], []]);

    await service.executar(new Date('2026-07-14T00:00:00Z'));

    expect(query.mock.calls[0][1]).toEqual([new Date('2026-04-15T00:00:00Z')]);
  });

  it('RETENCAO_DIAS sobrescreve o padrão', async () => {
    const { service, query } = build({ RETENCAO_DIAS: '30' }, [[], []]);

    await service.executar(new Date('2026-07-14T00:00:00Z'));

    expect(query.mock.calls[0][1]).toEqual([new Date('2026-06-14T00:00:00Z')]);
  });

  // Sem prazo informado (null = desconhecido, favor recall §3.3) o corte cai na
  // data de publicação — senão o edital sem prazo NUNCA seria elegível.
  it('trata prazo nulo caindo na data de publicação', async () => {
    const { service, query } = build({}, [[], []]);

    await service.executar();

    expect(query.mock.calls[0][0]).toContain(
      'COALESCE("prazo_proposta", "data_publicacao")',
    );
  });

  // Um DELETE de dezenas de milhares de linhas seguraria lock e memória no free
  // tier: apaga em lotes até a passada vir incompleta.
  it('apaga em lotes até esvaziar', async () => {
    const { service, query } = build({}, [ids(2000), ids(2000), ids(7), []]);

    const r = await service.executar();

    expect(r.removidos).toBe(4007);
    expect(query).toHaveBeenCalledTimes(4); // 3 lotes + o UPDATE do payload
  });
});
