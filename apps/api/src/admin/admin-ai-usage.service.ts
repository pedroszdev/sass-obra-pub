import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AiUsage } from '../editais/ai-usage.entity';
import { User } from '../users/user.entity';

export interface HitRate {
  hits: number;
  chamadas: number;
  total: number;
  // Fração de acessos servidos pelo cache (0–1). Null quando não houve acesso
  // nenhum — 0% e "sem dado" são coisas diferentes e a tela precisa distinguir.
  taxa: number | null;
}

export interface ContaIa {
  userId: string;
  email: string | null;
  chamadas: number;
  hits: number;
  custoUsd: number;
}

export interface UsoIaConta {
  // Chamadas REAIS de IA (cache hit não conta) por tipo de trabalho.
  exigencias: number;
  itens: number;
  chamadas: number;
  hits: number;
  custoUsd: number;
}

// Leitura do uso de IA (T-190a → a entrega da leitura). O write mora no
// AiUsageService (editais/), este é só o read do admin — mesma separação do
// SearchLogService/AdminSearchLogService (T-199).
//
// ⚠️ O histórico começa no dia em que a T-190a subiu (24/07/2026): antes disso
// não há linha nenhuma. Por isso `inicioHistorico` é exposto — sem ele, uma tela
// zerada parece defeito, e não "ainda não houve uso desde que passamos a medir".
@Injectable()
export class AdminAiUsageService {
  constructor(
    @InjectRepository(AiUsage)
    private readonly repo: Repository<AiUsage>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  // Quando a medição começou. Null = nada registrado ainda.
  async inicioHistorico(): Promise<Date | null> {
    const row = await this.repo
      .createQueryBuilder('u')
      .select('MIN(u.created_at)', 'min')
      .getRawOne<{ min: Date | null }>();
    return row?.min ?? null;
  }

  async hitRate(inicio?: Date): Promise<HitRate> {
    const qb = this.repo
      .createQueryBuilder('u')
      .select('COUNT(*) FILTER (WHERE u.cache_hit)', 'hits')
      .addSelect('COUNT(*) FILTER (WHERE NOT u.cache_hit)', 'chamadas');
    if (inicio) qb.where('u.created_at >= :inicio', { inicio });
    const row = await qb.getRawOne<{ hits: string; chamadas: string }>();

    const hits = Number(row?.hits ?? 0) || 0;
    const chamadas = Number(row?.chamadas ?? 0) || 0;
    const total = hits + chamadas;
    return { hits, chamadas, total, taxa: total === 0 ? null : hits / total };
  }

  // Gasto por conta, maior primeiro. Linhas SEM usuário (pré-computação em
  // background) ficam de fora de propósito: não são de ninguém, e somá-las a uma
  // conta seria mentira. Isso significa que a soma desta lista é MENOR que o
  // gasto total — a tela avisa.
  async porConta(inicio?: Date, limite = 20): Promise<ContaIa[]> {
    const qb = this.repo
      .createQueryBuilder('u')
      .select('u.user_id', 'userId')
      .addSelect('COUNT(*) FILTER (WHERE NOT u.cache_hit)', 'chamadas')
      .addSelect('COUNT(*) FILTER (WHERE u.cache_hit)', 'hits')
      .addSelect('COALESCE(SUM(u.custo_usd), 0)', 'custo')
      .where('u.user_id IS NOT NULL');
    if (inicio) qb.andWhere('u.created_at >= :inicio', { inicio });
    const linhas = await qb
      .groupBy('u.user_id')
      .orderBy('custo', 'DESC')
      .limit(limite)
      .getRawMany<{
        userId: string;
        chamadas: string;
        hits: string;
        custo: string;
      }>();

    const emails = await this.emailsDe(linhas.map((l) => l.userId));
    return linhas.map((l) => ({
      userId: l.userId,
      email: emails.get(l.userId) ?? null,
      chamadas: Number(l.chamadas) || 0,
      hits: Number(l.hits) || 0,
      custoUsd: Number(l.custo) || 0,
    }));
  }

  // Contadores de IA de UMA conta — o que a T-184 deixou pendente ("resumos IA e
  // diagnósticos não são atribuíveis por conta hoje").
  async daConta(userId: string): Promise<UsoIaConta> {
    const row = await this.repo
      .createQueryBuilder('u')
      .select(
        "COUNT(*) FILTER (WHERE NOT u.cache_hit AND u.feature = 'exigencias')",
        'exigencias',
      )
      .addSelect(
        "COUNT(*) FILTER (WHERE NOT u.cache_hit AND u.feature = 'itens')",
        'itens',
      )
      .addSelect('COUNT(*) FILTER (WHERE NOT u.cache_hit)', 'chamadas')
      .addSelect('COUNT(*) FILTER (WHERE u.cache_hit)', 'hits')
      .addSelect('COALESCE(SUM(u.custo_usd), 0)', 'custo')
      .where('u.user_id = :userId', { userId })
      .getRawOne<{
        exigencias: string;
        itens: string;
        chamadas: string;
        hits: string;
        custo: string;
      }>();

    return {
      exigencias: Number(row?.exigencias ?? 0) || 0,
      itens: Number(row?.itens ?? 0) || 0,
      chamadas: Number(row?.chamadas ?? 0) || 0,
      hits: Number(row?.hits ?? 0) || 0,
      custoUsd: Number(row?.custo ?? 0) || 0,
    };
  }

  // E-mails das contas da lista. Sem FK em ai_usage (registro contábil sobrevive
  // à exclusão da conta), então o id pode não ter mais dono — daí o email null.
  private async emailsDe(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const linhas = await this.users.find({
      where: { id: In(ids) },
      select: { id: true, email: true },
    });
    return new Map(linhas.map((u) => [u.id, u.email]));
  }
}
