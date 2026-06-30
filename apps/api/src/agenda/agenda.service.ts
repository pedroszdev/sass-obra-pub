import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Certidao } from '../company-profile/certidao.entity';
import { Edital } from '../editais/edital.entity';
import { Favorito } from '../favoritos/favorito.entity';
import { Proposta } from '../propostas/proposta.entity';
import { AgendaEditalInput, AgendaEvento, montarAgenda } from './agenda.types';

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
    }

    return { data: montarAgenda(editaisInput, certidoes, new Date()) };
  }
}
