import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Edital } from '../editais/edital.entity';
import {
  EditalExigencias,
  ExigenciasStatus,
} from '../editais/exigencias/edital-exigencias.entity';
import {
  EditalItensExtracao,
  ItensStatus,
} from '../editais/itens/edital-itens-extracao.entity';
import { AiOutputReview } from './ai-output-review.entity';

export type TipoSaida = 'resumo' | 'exigencias' | 'itens';

// Amostra RECENTE (§3.4) — não é histórico completo. Recorte por tabela.
const LIMITE_POR_TABELA = 100;

export interface IaOutputEntry {
  tipo: TipoSaida;
  editalId: string;
  editalObjeto: string;
  municipio: string;
  modelo: string | null;
  custoUsd: number | null;
  createdAt: Date;
  veredito: string | null; // 'ok' | 'errado' | null
}

export interface TaxaTipo {
  ok: number;
  errado: number;
}

export interface TaxaAcerto {
  geral: TaxaTipo;
  porTipo: Record<TipoSaida, TaxaTipo>;
}

export interface IaOutputsPagina {
  data: IaOutputEntry[];
  total: number;
  page: number;
  pageSize: number;
  taxa: TaxaAcerto;
}

@Injectable()
export class AdminIaOutputsService {
  constructor(
    @InjectRepository(EditalExigencias)
    private readonly exigencias: Repository<EditalExigencias>,
    @InjectRepository(EditalItensExtracao)
    private readonly itens: Repository<EditalItensExtracao>,
    @InjectRepository(AiOutputReview)
    private readonly reviews: Repository<AiOutputReview>,
    @InjectRepository(Edital)
    private readonly editais: Repository<Edital>,
  ) {}

  async listar(opts: {
    tipo?: TipoSaida;
    page: number;
    pageSize: number;
  }): Promise<IaOutputsPagina> {
    const querExig =
      !opts.tipo || opts.tipo === 'resumo' || opts.tipo === 'exigencias';
    const querItens = !opts.tipo || opts.tipo === 'itens';

    const [linhasExig, linhasItens] = await Promise.all([
      querExig
        ? this.exigencias.find({
            where: { status: ExigenciasStatus.EXTRAIDO },
            order: { updatedAt: 'DESC' },
            take: LIMITE_POR_TABELA,
          })
        : Promise.resolve([]),
      querItens
        ? this.itens.find({
            where: { status: ItensStatus.EXTRAIDO },
            order: { updatedAt: 'DESC' },
            take: LIMITE_POR_TABELA,
          })
        : Promise.resolve([]),
    ]);

    // Monta as entradas (resumo e exigências saem da MESMA linha, separados).
    const entradas: Omit<
      IaOutputEntry,
      'editalObjeto' | 'municipio' | 'veredito'
    >[] = [];
    for (const e of linhasExig) {
      if ((!opts.tipo || opts.tipo === 'resumo') && e.resumo) {
        entradas.push(
          this.baseEntry(
            'resumo',
            e.editalId,
            e.modelo,
            e.custoUsd,
            e.updatedAt,
          ),
        );
      }
      if ((!opts.tipo || opts.tipo === 'exigencias') && e.exigencias) {
        entradas.push(
          this.baseEntry(
            'exigencias',
            e.editalId,
            e.modelo,
            e.custoUsd,
            e.updatedAt,
          ),
        );
      }
    }
    for (const i of linhasItens) {
      if (i.itens) {
        entradas.push(
          this.baseEntry(
            'itens',
            i.editalId,
            i.modelo,
            i.custoUsd,
            i.updatedAt,
          ),
        );
      }
    }

    entradas.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const total = entradas.length;
    const pagina = entradas.slice(
      (opts.page - 1) * opts.pageSize,
      opts.page * opts.pageSize,
    );

    const [editaisPorId, vereditos, taxa] = await Promise.all([
      this.editaisPorId(pagina.map((e) => e.editalId)),
      this.vereditosDe(pagina),
      this.taxaAcerto(),
    ]);

    return {
      data: pagina.map((e) => ({
        ...e,
        editalObjeto:
          editaisPorId.get(e.editalId)?.objeto ?? '(edital removido)',
        municipio: editaisPorId.get(e.editalId)?.municipioNome ?? '—',
        veredito: vereditos.get(`${e.tipo}:${e.editalId}`) ?? null,
      })),
      total,
      page: opts.page,
      pageSize: opts.pageSize,
      taxa,
    };
  }

  async taxaAcerto(): Promise<TaxaAcerto> {
    const linhas = await this.reviews
      .createQueryBuilder('r')
      .select('r.tipo', 'tipo')
      .addSelect('r.veredito', 'veredito')
      .addSelect('COUNT(*)', 'total')
      .groupBy('r.tipo')
      .addGroupBy('r.veredito')
      .getRawMany<{ tipo: string; veredito: string; total: string }>();

    const zero = (): TaxaTipo => ({ ok: 0, errado: 0 });
    const porTipo: Record<TipoSaida, TaxaTipo> = {
      resumo: zero(),
      exigencias: zero(),
      itens: zero(),
    };
    const geral = zero();
    for (const l of linhas) {
      const n = Number(l.total);
      const tipo = l.tipo as TipoSaida;
      const chave = l.veredito === 'ok' ? 'ok' : 'errado';
      if (porTipo[tipo]) porTipo[tipo][chave] += n;
      geral[chave] += n;
    }
    return { geral, porTipo };
  }

  async marcar(dados: {
    tipo: TipoSaida;
    editalId: string;
    veredito: 'ok' | 'errado';
    nota?: string;
  }): Promise<void> {
    await this.reviews.upsert(
      {
        tipo: dados.tipo,
        editalId: dados.editalId,
        veredito: dados.veredito,
        nota: dados.nota ?? null,
      },
      ['tipo', 'editalId'],
    );
  }

  private baseEntry(
    tipo: TipoSaida,
    editalId: string,
    modelo: string | null,
    custoUsd: number | null,
    createdAt: Date,
  ) {
    return { tipo, editalId, modelo, custoUsd, createdAt };
  }

  private async editaisPorId(ids: string[]): Promise<Map<string, Edital>> {
    if (ids.length === 0) return new Map();
    const editais = await this.editais.find({
      where: { id: In(ids) },
      select: { id: true, objeto: true, municipioNome: true },
    });
    return new Map(editais.map((e) => [e.id, e]));
  }

  private async vereditosDe(
    entradas: { tipo: TipoSaida; editalId: string }[],
  ): Promise<Map<string, string>> {
    if (entradas.length === 0) return new Map();
    const editalIds = [...new Set(entradas.map((e) => e.editalId))];
    const tipos = [...new Set(entradas.map((e) => e.tipo))];
    const linhas = await this.reviews.find({
      where: {
        editalId: In(editalIds),
        tipo: tipos.length === 1 ? tipos[0] : In(tipos),
      },
    });
    return new Map(linhas.map((r) => [`${r.tipo}:${r.editalId}`, r.veredito]));
  }
}
