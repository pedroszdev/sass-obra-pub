import { Repository } from 'typeorm';
import { AiUsage } from '../src/editais/ai-usage.entity';
import { AiUsageService } from '../src/editais/ai-usage.service';

// Registro de uso de IA (T-190a). O que estes testes protegem: (a) a atribuição
// (quem gastou), (b) o custo ZERO no cache hit — se um hit gravasse o custo do
// cache, o total por conta contaria de novo o que já foi pago uma vez — e (c) a
// promessa de que o registro NUNCA quebra o caminho de IA.
describe('AiUsageService (T-190a)', () => {
  function montar() {
    const repo = { insert: jest.fn().mockResolvedValue(undefined) };
    const service = new AiUsageService(repo as unknown as Repository<AiUsage>);
    return { repo, service };
  }

  it('grava a chamada real com tokens, custo e o usuário que provocou', async () => {
    const { repo, service } = montar();

    await service.registrar({
      feature: 'exigencias',
      ctx: { origem: 'usuario', userId: 'user-1' },
      editalId: 'edital-1',
      cacheHit: false,
      modelo: 'gpt-5.4-mini',
      promptTokens: 1200,
      completionTokens: 300,
      custoUsd: 0.0042,
    });

    expect(repo.insert).toHaveBeenCalledWith({
      feature: 'exigencias',
      origem: 'usuario',
      userId: 'user-1',
      editalId: 'edital-1',
      cacheHit: false,
      modelo: 'gpt-5.4-mini',
      promptTokens: 1200,
      completionTokens: 300,
      custoUsd: 0.0042,
    });
  });

  it('zera tokens e custo no cache hit, mesmo se o chamador mandar valores', async () => {
    const { repo, service } = montar();

    await service.registrar({
      feature: 'itens',
      ctx: { origem: 'usuario', userId: 'user-1' },
      editalId: 'edital-1',
      cacheHit: true,
      modelo: 'gpt-5.4-mini',
      promptTokens: 999,
      completionTokens: 999,
      custoUsd: 9.99,
    });

    const gravado = repo.insert.mock.calls[0][0] as AiUsage;
    expect(gravado.cacheHit).toBe(true);
    expect(gravado.promptTokens).toBe(0);
    expect(gravado.completionTokens).toBe(0);
    expect(gravado.custoUsd).toBe(0);
    // O modelo do cache é preservado: serve para saber QUAL modelo produziu o
    // resultado que está sendo servido.
    expect(gravado.modelo).toBe('gpt-5.4-mini');
  });

  it('grava userId null quando não há usuário (pré-computação em background)', async () => {
    const { repo, service } = montar();

    await service.registrar({
      feature: 'exigencias',
      ctx: { origem: 'precomputacao' },
      editalId: 'edital-1',
      cacheHit: false,
      custoUsd: 0.003,
    });

    const gravado = repo.insert.mock.calls[0][0] as AiUsage;
    expect(gravado.userId).toBeNull();
    expect(gravado.origem).toBe('precomputacao');
  });

  it('não propaga erro do banco — registrar uso não pode derrubar a extração', async () => {
    const { repo, service } = montar();
    repo.insert.mockRejectedValue(new Error('banco fora'));

    expect(() =>
      service.registrarEmSegundoPlano({
        feature: 'exigencias',
        ctx: { origem: 'usuario', userId: 'user-1' },
        editalId: 'edital-1',
        cacheHit: false,
      }),
    ).not.toThrow();

    // Deixa a rejeição interna assentar: se ela escapasse, viraria
    // unhandledRejection e derrubaria o processo em produção.
    await new Promise((r) => setImmediate(r));
    expect(repo.insert).toHaveBeenCalled();
  });
});
