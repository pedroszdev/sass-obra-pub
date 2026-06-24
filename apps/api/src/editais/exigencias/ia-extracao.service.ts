import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { EXIGENCIAS_JSON_SCHEMA } from './exigencias-schema';
import { ExtracaoIa } from './exigencias.types';

const MODELO_PADRAO = 'gpt-5.4-mini'; // melhor custo/acerto medido no spike (T-48)
const MAX_CHARS = 300000; // teto de texto enviado (bound de custo/contexto)
const MAX_COMPLETION_TOKENS = 16000; // inclui tokens de reasoning do gpt-5.x

const SYSTEM = `Você é um analista de licitações de OBRA PÚBLICA no Brasil (Lei 14.133/2021).
Extraia APENAS as exigências de HABILITAÇÃO que o edital realmente declara — os
documentos e condições que a empresa precisa cumprir para participar e ser habilitada.
Regras:
- NÃO invente. Se o edital não menciona um item, marque "exigida"/"exigido" como false.
- Sempre que afirmar que algo é exigido, copie no campo "trecho" um recorte CURTO e
  LITERAL (verbatim) do edital — palavra por palavra, sem reescrever nem resumir.
- Foque em habilitação (jurídica, fiscal/trabalhista, econômico-financeira, técnica).
Além das exigências, produza um RESUMO de 1 página (campo "resumo") para o
empreiteiro entender a obra rápido:
- visaoGeral: 2-4 frases em linguagem simples sobre o escopo da obra.
- prazoExecucao: prazo de EXECUÇÃO da obra se o edital informar (senão null).
- datasChave: datas/eventos relevantes (sessão de abertura, visita técnica, etc.).
- pontosDeAtencao: o que o empreiteiro deve notar (visita obrigatória, garantia,
  índices contábeis, consórcio permitido, etc.). Não invente.
- Responda em português, no formato JSON do schema fornecido.`;

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
    this.client = new OpenAI({ apiKey });
    return this.client;
  }

  // Extrai as exigências de habilitação do texto do edital. Erros (rede, rate
  // limit, resposta inesperada) sobem para o orquestrador marcar status "erro".
  async extrair(texto: string): Promise<ExtracaoIa> {
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
    return JSON.parse(content) as ExtracaoIa;
  }
}
