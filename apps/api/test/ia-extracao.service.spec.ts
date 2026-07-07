import { ConfigService } from '@nestjs/config';
import type OpenAI from 'openai';
import { IaExtracaoService } from '../src/editais/exigencias/ia-extracao.service';

// Resposta mínima no formato do OpenAI chat.completions.
function resposta(over: {
  content?: string | null;
  refusal?: string | null;
  finish?: string;
  prompt?: number;
  completion?: number;
}) {
  return {
    choices: [
      {
        message: {
          content: over.content === undefined ? '{}' : over.content,
          refusal: over.refusal ?? null,
        },
        finish_reason: over.finish ?? 'stop',
      },
    ],
    usage: {
      prompt_tokens: over.prompt ?? 0,
      completion_tokens: over.completion ?? 0,
    },
  };
}

// Subclasse para injetar um client fake (getClient é protected de propósito).
class IaTestavel extends IaExtracaoService {
  create = jest.fn();
  protected getClient(): OpenAI {
    return {
      chat: { completions: { create: this.create } },
    } as unknown as OpenAI;
  }
}

function makeService(): IaTestavel {
  // OPENAI_MODEL ausente → modelo padrão gpt-5.4-mini (0,75/4,5 USD por MTok).
  const config = { get: jest.fn(() => undefined) };
  return new IaTestavel(config as unknown as ConfigService);
}

describe('IaExtracaoService (T-49/T-64)', () => {
  it('calcula o custo USD pelos tokens e preço do modelo padrão (§3.4)', async () => {
    const service = makeService();
    service.create.mockResolvedValue(
      resposta({
        content: JSON.stringify({ resumoObjeto: 'x' }),
        prompt: 2_000_000, // 2 MTok × 0,75 = 1,50
        completion: 1_000_000, // 1 MTok × 4,50 = 4,50
      }),
    );

    const r = await service.extrair('texto do edital');

    expect(r.promptTokens).toBe(2_000_000);
    expect(r.completionTokens).toBe(1_000_000);
    expect(r.custoUsd).toBeCloseTo(6.0, 6); // 1,50 + 4,50
  });

  it('recusa da IA (refusal) vira erro', async () => {
    const service = makeService();
    service.create.mockResolvedValue(
      resposta({ refusal: 'não posso ajudar', content: null }),
    );
    await expect(service.extrair('t')).rejects.toThrow(/recusou/);
  });

  it('sem conteúdo (truncado/finish_reason length) vira erro', async () => {
    const service = makeService();
    service.create.mockResolvedValue(
      resposta({ content: null, finish: 'length' }),
    );
    await expect(service.extrairItens('t')).rejects.toThrow(/não retornou/);
  });

  it('trunca o texto no teto de chars antes de enviar (bound de custo)', async () => {
    const service = makeService();
    service.create.mockResolvedValue(resposta({ content: '{}' }));
    const enorme = 'a'.repeat(400_000); // > MAX_CHARS (300k)

    await service.extrair(enorme);

    const arg = service.create.mock.calls[0][0] as {
      messages: { content: string }[];
    };
    const userContent = arg.messages[1].content;
    // O corpo do usuário não pode carregar os 400k inteiros (foi cortado em 300k).
    expect(userContent.length).toBeLessThan(320_000);
  });
});
