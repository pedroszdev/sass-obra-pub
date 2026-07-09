import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { ITENS_JSON_SCHEMA } from '../itens/itens-schema';
import { ExtracaoItensComUso, ExtracaoItensIa } from '../itens/itens.types';
import { EXIGENCIAS_JSON_SCHEMA } from './exigencias-schema';
import { ExtracaoIa } from './exigencias.types';

const MODELO_PADRAO = 'gpt-5.4-mini'; // melhor custo/acerto medido no spike (T-48)
const MAX_CHARS = 300000; // teto de texto enviado (bound de custo/contexto)
// Timeout explícito do client (T-104): sem isto o SDK segura a conexão HTTP por
// minutos numa chamada travada. 2 min cobre a extração de planilha grande (T-64).
const OPENAI_TIMEOUT_MS = 120000;
const OPENAI_MAX_RETRIES = 2; // o SDK já faz backoff em 429/5xx/timeout
const MAX_COMPLETION_TOKENS = 16000; // inclui tokens de reasoning do gpt-5.x
const MAX_COMPLETION_TOKENS_ITENS = 32000; // planilhas têm muitos itens (T-64)

// Preços por MTok (entrada/saída) — OpenAI, jun/2026. Para o custo estimado por
// extração; ATUALIZAR ao trocar de modelo/preço.
const PRECOS_USD_POR_MTOK: Record<string, { entrada: number; saida: number }> =
  {
    'gpt-5.5': { entrada: 5, saida: 30 },
    'gpt-5.4': { entrada: 2.5, saida: 15 },
    'gpt-5.4-mini': { entrada: 0.75, saida: 4.5 },
    'gpt-5.4-nano': { entrada: 0.2, saida: 1.25 },
  };

// Resultado da extração + o uso (tokens/custo) para auditoria (cache T-49).
export interface ExtracaoComUso {
  resultado: ExtracaoIa;
  promptTokens: number;
  completionTokens: number;
  custoUsd: number;
}

const SYSTEM = `Você é um analista de licitações de OBRA PÚBLICA no Brasil (Lei 14.133/2021).
Extraia APENAS as exigências de HABILITAÇÃO que o edital realmente declara — os
documentos e condições que a empresa precisa cumprir para participar e ser habilitada.
Regras:
- NÃO invente. Se o edital não menciona um item, marque "exigida"/"exigido" como false.
- Sempre que afirmar que algo é exigido, copie no campo "trecho" um recorte CURTO e
  LITERAL (verbatim) do edital — palavra por palavra, sem reescrever nem resumir.
- Foque em habilitação (jurídica, fiscal/trabalhista, econômico-financeira, técnica).
- "capitalSocial" cobre a qualificação econômico-financeira mínima: vale tanto
  CAPITAL SOCIAL mínimo quanto PATRIMÔNIO LÍQUIDO mínimo (Lei 14.133, art. 69).
  Se o edital exigir qualquer um dos dois, marque exigido=true e diga em "base"
  qual é. NÃO deixe isso apenas em "outrosRequisitos".
- Se o edital permitir comprovar a habilitação pelo REGISTRO CADASTRAL (SICAF ou
  equivalente) em vez de apresentar as certidões avulsas, marque
  habilitacaoPorRegistroCadastral.aplicavel=true (isso não impede marcar também
  as certidões que o edital listar explicitamente).
Além das exigências, produza um RESUMO de 1 página (campo "resumo") para o
empreiteiro entender a obra rápido:
- visaoGeral: 2-4 frases em linguagem simples sobre o escopo da obra.
- prazoExecucao: prazo de EXECUÇÃO da obra se o edital informar (senão null).
- datasChave: datas/eventos relevantes (sessão de abertura, visita técnica, etc.).
- pontosDeAtencao: o que o empreiteiro deve notar (visita obrigatória, garantia,
  índices contábeis, consórcio permitido, etc.). Não invente.
- Responda em português, no formato JSON do schema fornecido.`;

const SYSTEM_ITENS = `Você extrai a PLANILHA ORÇAMENTÁRIA (relação de itens de serviço) de um edital de OBRA pública.
Para CADA item/linha da planilha, devolva: código (se houver), descrição do serviço, unidade (m², m³, vb, kg...),
quantidade e o preço unitário de referência (preço SEM BDI — o custo direto do orçamento-base, se a planilha trouxer).
Regras:
- NÃO invente itens. Extraia somente linhas que existem na planilha do texto fornecido.
- Ignore cabeçalhos de coluna, subtotais, totais, BDI e rodapés — só os itens de serviço.
- Quando a linha trouxer preço unitário SEM BDI e COM BDI, use o SEM BDI (custo direto).
- Se o texto NÃO contém uma planilha de itens (ex.: é só o edital), responda temPlanilha=false e itens=[].
- Números no padrão brasileiro (1.234,56) viram number (1234.56). Responda em português.`;

// Serviço de extração de exigências por IA (T-49). Fonte-agnóstico: recebe texto,
// devolve exigências estruturadas. Provider: OpenAI (CLAUDE.md §3.4).
@Injectable()
export class IaExtracaoService {
  private readonly logger = new Logger(IaExtracaoService.name);
  private client: OpenAI | null = null;

  constructor(private readonly config: ConfigService) {}

  get modelo(): string {
    return this.config.get<string>('OPENAI_MODEL') ?? MODELO_PADRAO;
  }

  // Cria o client sob demanda; isolado para os testes poderem substituí-lo.
  protected getClient(): OpenAI {
    if (this.client) return this.client;
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'Extração por IA desabilitada: defina OPENAI_API_KEY.',
      );
    }
    this.client = new OpenAI({
      apiKey,
      timeout: OPENAI_TIMEOUT_MS,
      maxRetries: OPENAI_MAX_RETRIES,
    });
    return this.client;
  }

  // Extrai as exigências de habilitação do texto do edital + o uso (tokens/custo).
  // Erros (rede, rate limit, resposta inesperada) sobem para o orquestrador
  // marcar status "erro".
  async extrair(texto: string): Promise<ExtracaoComUso> {
    const client = this.getClient();
    const corpo = texto.length > MAX_CHARS ? texto.slice(0, MAX_CHARS) : texto;

    const resposta = await client.chat.completions.create({
      model: this.modelo,
      max_completion_tokens: MAX_COMPLETION_TOKENS,
      messages: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: `Edital (texto extraído do PDF):\n\n${corpo}`,
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: EXIGENCIAS_JSON_SCHEMA,
      },
    });

    const escolha = resposta.choices[0];
    if (escolha?.message?.refusal) {
      throw new Error(`IA recusou a extração: ${escolha.message.refusal}`);
    }
    const content = escolha?.message?.content;
    if (!content) {
      throw new Error(
        `IA não retornou conteúdo (finish_reason=${escolha?.finish_reason}).`,
      );
    }

    const promptTokens = resposta.usage?.prompt_tokens ?? 0;
    const completionTokens = resposta.usage?.completion_tokens ?? 0;
    return {
      resultado: JSON.parse(content) as ExtracaoIa,
      promptTokens,
      completionTokens,
      custoUsd: this.calcularCusto(promptTokens, completionTokens),
    };
  }

  // Extrai a planilha de itens (T-64) de um texto de planilha/edital + o uso.
  // Schema/prompt próprios; preço de referência SEM BDI (custo direto, T-63).
  async extrairItens(texto: string): Promise<ExtracaoItensComUso> {
    const client = this.getClient();
    const corpo = texto.length > MAX_CHARS ? texto.slice(0, MAX_CHARS) : texto;

    const resposta = await client.chat.completions.create({
      model: this.modelo,
      max_completion_tokens: MAX_COMPLETION_TOKENS_ITENS,
      messages: [
        { role: 'system', content: SYSTEM_ITENS },
        { role: 'user', content: `Texto da planilha/edital:\n\n${corpo}` },
      ],
      response_format: { type: 'json_schema', json_schema: ITENS_JSON_SCHEMA },
    });

    const escolha = resposta.choices[0];
    if (escolha?.message?.refusal) {
      throw new Error(
        `IA recusou a extração de itens: ${escolha.message.refusal}`,
      );
    }
    const content = escolha?.message?.content;
    if (!content) {
      throw new Error(
        `IA não retornou conteúdo (finish_reason=${escolha?.finish_reason}).`,
      );
    }

    const promptTokens = resposta.usage?.prompt_tokens ?? 0;
    const completionTokens = resposta.usage?.completion_tokens ?? 0;
    return {
      resultado: JSON.parse(content) as ExtracaoItensIa,
      promptTokens,
      completionTokens,
      custoUsd: this.calcularCusto(promptTokens, completionTokens),
    };
  }

  // Custo estimado (USD) da chamada, pelo preço do modelo configurado.
  private calcularCusto(
    promptTokens: number,
    completionTokens: number,
  ): number {
    const p =
      PRECOS_USD_POR_MTOK[this.modelo] ?? PRECOS_USD_POR_MTOK[MODELO_PADRAO];
    return (
      (promptTokens / 1e6) * p.entrada + (completionTokens / 1e6) * p.saida
    );
  }
}
