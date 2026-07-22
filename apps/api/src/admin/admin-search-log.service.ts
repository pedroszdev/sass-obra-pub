import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { SearchLog } from '../editais/search-log.entity';

export interface TermoContagem {
  termo: string;
  total: number;
}

export interface UfsContagem {
  ufs: string;
  total: number;
}

export interface BuscaZerada {
  id: string;
  userId: string | null;
  termo: string | null;
  ufs: string[] | null;
  municipios: string[] | null;
  valorMin: number | null;
  valorMax: number | null;
  createdAt: Date;
}

export interface ResumoBuscas {
  totalBuscas: number;
  semResultado: number;
  termosTop: TermoContagem[];
  ufsZeradasTop: UfsContagem[];
  recentesZeradas: BuscaZerada[];
}

export interface FiltroBuscas {
  desde?: Date;
  ate?: Date;
}

// Leitura do log de buscas (T-199) para o admin. Read-only; o write é do
// SearchLogService (módulo editais). Responde "o que buscam" (termosTop) e "o
// que dá zero" (ufsZeradasTop + recentesZeradas) — o insumo da captação sob
// demanda (T-34) e da classificação (T-140).
@Injectable()
export class AdminSearchLogService {
  constructor(
    @InjectRepository(SearchLog)
    private readonly repo: Repository<SearchLog>,
  ) {}

  async resumo(f: FiltroBuscas): Promise<ResumoBuscas> {
    // Janela uniforme (evita SQL dinâmico): sem desde → desde a época; sem ate → agora.
    const periodo = Between(f.desde ?? new Date(0), f.ate ?? new Date());

    const [totalBuscas, semResultado, termosTop, ufsZeradasTop, recentes] =
      await Promise.all([
        this.repo.count({ where: { createdAt: periodo } }),
        this.repo.count({ where: { createdAt: periodo, total: 0 } }),
        this.termosTop(f),
        this.ufsZeradasTop(f),
        this.repo.find({
          where: { createdAt: periodo, total: 0 },
          order: { createdAt: 'DESC' },
          take: 30,
        }),
      ]);

    return {
      totalBuscas,
      semResultado,
      termosTop,
      ufsZeradasTop,
      recentesZeradas: recentes.map((r) => ({
        id: r.id,
        userId: r.userId,
        termo: r.termo,
        ufs: r.ufs,
        municipios: r.municipios,
        valorMin: r.valorMin,
        valorMax: r.valorMax,
        createdAt: r.createdAt,
      })),
    };
  }

  private async termosTop(f: FiltroBuscas): Promise<TermoContagem[]> {
    const qb = this.repo
      .createQueryBuilder('s')
      .select('s.termo', 'termo')
      .addSelect('COUNT(*)', 'total')
      .where('s.termo IS NOT NULL')
      .andWhere("s.termo <> ''")
      .groupBy('s.termo')
      .orderBy('total', 'DESC')
      .limit(15);
    this.periodo(qb, f);
    const linhas = await qb.getRawMany<{ termo: string; total: string }>();
    return linhas.map((l) => ({ termo: l.termo, total: Number(l.total) }));
  }

  // Buscas SEM resultado agrupadas por UF(s) do filtro. Agrupa pelo campo inteiro
  // (ex.: "SC" ou "SC,PR") — simples e all-ORM; buscas multi-UF viram um balde
  // próprio, aceitável na v1.
  private async ufsZeradasTop(f: FiltroBuscas): Promise<UfsContagem[]> {
    const qb = this.repo
      .createQueryBuilder('s')
      .select('s.ufs', 'ufs')
      .addSelect('COUNT(*)', 'total')
      .where('s.total = 0')
      .andWhere('s.ufs IS NOT NULL')
      .groupBy('s.ufs')
      .orderBy('total', 'DESC')
      .limit(15);
    this.periodo(qb, f);
    const linhas = await qb.getRawMany<{ ufs: string; total: string }>();
    return linhas.map((l) => ({ ufs: l.ufs, total: Number(l.total) }));
  }

  private periodo(
    qb: ReturnType<Repository<SearchLog>['createQueryBuilder']>,
    f: FiltroBuscas,
  ): void {
    if (f.desde) qb.andWhere('s.created_at >= :desde', { desde: f.desde });
    if (f.ate) qb.andWhere('s.created_at <= :ate', { ate: f.ate });
  }
}
