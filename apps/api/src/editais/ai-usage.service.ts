import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { capturarErro } from '../common/observabilidade';
import { AiFeature, AiOrigem, AiUsage } from './ai-usage.entity';

// Quem provocou o uso de IA. Viaja junto do `getOrExtract` porque os serviços de
// extração são chamados tanto por um usuário (abriu o edital, pediu o
// diagnóstico, importou a planilha) quanto por ninguém (pré-computação em
// background) ou pelo dono (curadoria no admin).
export interface AiUsageContext {
  origem: AiOrigem;
  userId?: string | null;
}

// Contexto padrão para quem não informa: pré-computação, sem usuário. É o caso
// conservador — atribuir um uso a um usuário errado é pior que não atribuir.
export const CTX_PRECOMPUTACAO: AiUsageContext = { origem: 'precomputacao' };

export interface RegistroUsoIa {
  feature: AiFeature;
  ctx: AiUsageContext;
  editalId: string;
  cacheHit: boolean;
  modelo?: string | null;
  promptTokens?: number;
  completionTokens?: number;
  custoUsd?: number;
}

// Gravação do uso de IA (T-190a). Só o WRITE — a leitura (custo por conta, hit
// rate, contadores da conta) é da entrega seguinte, e o histórico só existe a
// partir do dia em que isto começa a gravar, por isso sobe antes da tela.
//
// NUNCA quebra nem atrasa o caminho de IA: é efeito colateral, no mesmo padrão
// do SearchLogService (T-199) e do MailLogService (T-193). Erro morre no log +
// Sentry.
@Injectable()
export class AiUsageService {
  private readonly logger = new Logger(AiUsageService.name);

  constructor(
    @InjectRepository(AiUsage)
    private readonly repo: Repository<AiUsage>,
  ) {}

  // Dispara sem esperar. O chamador NÃO deve dar await: o usuário já tem o
  // resultado da extração, e um insert lento não pode pendurar a resposta.
  registrarEmSegundoPlano(r: RegistroUsoIa): void {
    void this.registrar(r).catch((e: unknown) => {
      capturarErro(e, 'ai-usage.registrar');
      this.logger.warn(`Falha ao registrar uso de IA: ${this.msg(e)}`);
    });
  }

  async registrar(r: RegistroUsoIa): Promise<void> {
    await this.repo.insert({
      feature: r.feature,
      origem: r.ctx.origem,
      userId: r.ctx.userId ?? null,
      editalId: r.editalId,
      cacheHit: r.cacheHit,
      modelo: r.modelo ?? null,
      // Um cache hit não chamou a OpenAI: tokens e custo são zero por definição,
      // não "desconhecidos". Zerar aqui impede que o custo do cache (que está
      // gravado na linha de cache) seja contado de novo a cada leitura.
      promptTokens: r.cacheHit ? 0 : (r.promptTokens ?? 0),
      completionTokens: r.cacheHit ? 0 : (r.completionTokens ?? 0),
      custoUsd: r.cacheHit ? 0 : (r.custoUsd ?? 0),
    });
  }

  private msg(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
  }
}
