import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Certidao } from '../company-profile/certidao.entity';
import {
  EditalExigencias,
  ExigenciasStatus,
} from '../editais/exigencias/edital-exigencias.entity';
import { Edital } from '../editais/edital.entity';
import { Favorito } from '../favoritos/favorito.entity';
import { Proposta } from '../propostas/proposta.entity';
import {
  AgendaDataChaveInput,
  AgendaEditalInput,
  AgendaEvento,
  montarAgenda,
} from './agenda.types';

// Agenda de prazos do usuário (T-91). Agrega, a partir do que ele já acompanha,
// os prazos reais: entrega de proposta (editais salvos + com proposta) e
// vencimento de certidões. A derivação/ordenação é pura (montarAgenda, §3.3).
@Injectable()
export class AgendaService {
  constructor(
    @InjectRepository(Favorito)
    private readonly favoritos: Repository<Favorito>,
    @InjectRepository(Edital)
    private readonly editais: Repository<Edital>,
    @InjectRepository(Proposta)
    private readonly propostas: Repository<Proposta>,
    @InjectRepository(Certidao)
    private readonly certidoes: Repository<Certidao>,
    @InjectRepository(EditalExigencias)
    private readonly exigencias: Repository<EditalExigencias>,
  ) {}

  async listar(userId: string): Promise<{ data: AgendaEvento[] }> {
    const [favs, props, certidoes] = await Promise.all([
      this.favoritos.find({ where: { userId }, select: { editalId: true } }),
      this.propostas.find({
        where: { userId },
        select: { id: true, editalId: true },
        order: { createdAt: 'DESC' },
      }),
      this.certidoes.find({ where: { userId } }),
    ]);

    // editalId → propostaId (a mais recente vence, pra linkar o card à proposta).
    const propostaPorEdital = new Map<string, string>();
    for (const p of props) {
      if (!propostaPorEdital.has(p.editalId)) {
        propostaPorEdital.set(p.editalId, p.id);
      }
    }

    // União dos editais salvos + com proposta (sem duplicar).
    const editalIds = [
      ...new Set([
        ...favs.map((f) => f.editalId),
        ...props.map((p) => p.editalId),
      ]),
    ];

    let editaisInput: AgendaEditalInput[] = [];
    let datasChave: AgendaDataChaveInput[] = [];
    if (editalIds.length > 0) {
      const editais = await this.editais.find({
        where: { id: In(editalIds) },
        select: {
          id: true,
          objeto: true,
          municipioNome: true,
          uf: true,
          prazoProposta: true,
        },
      });
      editaisInput = editais.map((e) => ({
        id: e.id,
        objeto: e.objeto,
        municipioNome: e.municipioNome,
        uf: e.uf,
        prazoProposta: e.prazoProposta,
        propostaId: propostaPorEdital.get(e.id) ?? null,
      }));
      datasChave = await this.carregarDatasChave(editaisInput);
    }

    return {
      data: montarAgenda(editaisInput, certidoes, new Date(), datasChave),
    };
  }

  // Datas-chave (sessão/visita técnica) dos editais já analisados por IA (T-112).
  // Lê o cache (resumo.datasChave dos que estão EXTRAIDO) — nenhuma chamada de IA
  // (§3.4). O texto livre é parseado no montarAgenda.
  private async carregarDatasChave(
    editais: AgendaEditalInput[],
  ): Promise<AgendaDataChaveInput[]> {
    const porEdital = new Map(editais.map((e) => [e.id, e]));
    const linhas = await this.exigencias.find({
      where: {
        editalId: In([...porEdital.keys()]),
        status: ExigenciasStatus.EXTRAIDO,
      },
      select: { editalId: true, resumo: true },
    });

    const out: AgendaDataChaveInput[] = [];
    for (const l of linhas) {
      const edital = porEdital.get(l.editalId);
      if (!edital) continue;
      for (const dc of l.resumo?.datasChave ?? []) {
        if (!dc.evento?.trim() || !dc.quando?.trim()) continue;
        out.push({
          editalId: edital.id,
          objeto: edital.objeto,
          municipioNome: edital.municipioNome,
          uf: edital.uf,
          evento: dc.evento.trim(),
          quando: dc.quando.trim(),
        });
      }
    }
    return out;
  }
}
