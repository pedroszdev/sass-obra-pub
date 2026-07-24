import { Repository } from 'typeorm';
import { AdminAiUsageService } from '../src/admin/admin-ai-usage.service';
import { AiUsage } from '../src/editais/ai-usage.entity';
import { User } from '../src/users/user.entity';

// Leitura do uso de IA (T-190a). Estes testes protegem as três decisões que a
// tela depende: (a) "sem dado" ≠ "0%", (b) a lista por conta EXCLUI o uso sem
// dono (pré-computação), e (c) conta apagada não derruba a lista.
describe('AdminAiUsageService (T-190a — leitura)', () => {
  function montar(raw: unknown, usuarios: User[] = []) {
    const qb = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue(raw),
      getRawMany: jest.fn().mockResolvedValue(raw ?? []),
    };
    const repo = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
    const users = { find: jest.fn().mockResolvedValue(usuarios) };
    const service = new AdminAiUsageService(
      repo as unknown as Repository<AiUsage>,
      users as unknown as Repository<User>,
    );
    return { service, qb, users };
  }

  describe('hitRate', () => {
    it('calcula a fração servida pelo cache', async () => {
      const { service } = montar({ hits: '30', chamadas: '10' });

      const r = await service.hitRate();

      expect(r.hits).toBe(30);
      expect(r.chamadas).toBe(10);
      expect(r.total).toBe(40);
      expect(r.taxa).toBeCloseTo(0.75);
    });

    it('devolve taxa NULL quando não houve acesso nenhum', async () => {
      const { service } = montar({ hits: '0', chamadas: '0' });

      const r = await service.hitRate();

      // 0% diria "o cache nunca serviu"; null diz "ainda não medimos nada".
      // A tela precisa distinguir — o ai_usage nasceu vazio.
      expect(r.taxa).toBeNull();
      expect(r.total).toBe(0);
    });
  });

  describe('porConta', () => {
    it('exclui o uso sem dono (pré-computação) do recorte por conta', async () => {
      const { service, qb } = montar([]);

      await service.porConta();

      expect(qb.where).toHaveBeenCalledWith('u.user_id IS NOT NULL');
    });

    it('junta o e-mail e devolve null para conta já excluída', async () => {
      const { service } = montar(
        [
          { userId: 'u1', chamadas: '5', hits: '2', custo: '0.12' },
          { userId: 'u2', chamadas: '1', hits: '0', custo: '0.01' },
        ],
        [{ id: 'u1', email: 'dono@obra.com' } as User],
      );

      const linhas = await service.porConta();

      expect(linhas[0]).toEqual({
        userId: 'u1',
        email: 'dono@obra.com',
        chamadas: 5,
        hits: 2,
        custoUsd: 0.12,
      });
      // u2 não está mais em `users`: ai_usage não tem FK de propósito (registro
      // contábil sobrevive à exclusão da conta), então a linha fica sem e-mail
      // em vez de sumir.
      expect(linhas[1].email).toBeNull();
      expect(linhas[1].custoUsd).toBe(0.01);
    });
  });

  describe('daConta', () => {
    it('separa exigências de itens e soma o custo da conta', async () => {
      const { service } = montar({
        exigencias: '4',
        itens: '2',
        chamadas: '6',
        hits: '9',
        custo: '0.0345',
      });

      const r = await service.daConta('u1');

      expect(r).toEqual({
        exigencias: 4,
        itens: 2,
        chamadas: 6,
        hits: 9,
        custoUsd: 0.0345,
      });
    });

    it('conta sem uso nenhum devolve zeros, não undefined', async () => {
      const { service } = montar(null);

      const r = await service.daConta('u1');

      expect(r).toEqual({
        exigencias: 0,
        itens: 0,
        chamadas: 0,
        hits: 0,
        custoUsd: 0,
      });
    });
  });
});
