import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, IsNull, Repository } from 'typeorm';
import { Certidao } from '../company-profile/certidao.entity';
import { Edital } from '../editais/edital.entity';
import { situacaoAtivaWhere } from '../editais/situacao';
import {
  EditalExigencias,
  ExigenciasStatus,
} from '../editais/exigencias/edital-exigencias.entity';
import { Favorito } from '../favoritos/favorito.entity';
import { Proposta } from '../propostas/proposta.entity';
import { PropostaStatus } from '../propostas/proposta-status.enum';
import { User } from '../users/user.entity';
import { AlertaItem, AlertasInput, construirAlertas } from './alertas.types';

// Central de notificações (T-90). Deriva os alertas do estado real do usuário
// (certidões, agenda de prazos, resumos prontos, resultados) e marca os "não
// lidos" pela última visita (users.alertas_visto_em). Só lê — nenhum evento é
// gerado/gravado. A montagem/ordenação é pura (construirAlertas, §3.3).
@Injectable()
export class AlertasService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Certidao)
    private readonly certidoes: Repository<Certidao>,
    @InjectRepository(Favorito)
    private readonly favoritos: Repository<Favorito>,
    @InjectRepository(Edital) private readonly editais: Repository<Edital>,
    @InjectRepository(Proposta)
    private readonly propostas: Repository<Proposta>,
    @InjectRepository(EditalExigencias)
    private readonly exigencias: Repository<EditalExigencias>,
  ) {}

  async listar(
    userId: string,
  ): Promise<{ itens: AlertaItem[]; naoLidos: number }> {
    const [user, certidoes, favs, props] = await Promise.all([
      this.users.findOne({ where: { id: userId } }),
      this.certidoes.find({ where: { userId } }),
      this.favoritos.find({ where: { userId }, select: { editalId: true } }),
      this.propostas.find({
        where: { userId },
        select: {
          id: true,
          editalId: true,
          titulo: true,
          status: true,
          updatedAt: true,
        },
      }),
    ]);

    const favIds = favs.map((f) => f.editalId);
    const propostaPorEdital = new Map<string, string>();
    for (const p of props) {
      if (!propostaPorEdital.has(p.editalId)) {
        propostaPorEdital.set(p.editalId, p.id);
      }
    }
    const unionIds = [...new Set([...favIds, ...props.map((p) => p.editalId)])];

    // Edital morto (anulado/revogado/suspenso) não gera alerta de prazo/resumo
    // (T-114) — não é oportunidade. Some mesmo se favoritado/com proposta.
    const editais = unionIds.length
      ? await this.editais.find({
          where: { id: In(unionIds), situacao: situacaoAtivaWhere() },
          select: {
            id: true,
            objeto: true,
            prazoProposta: true,
            dataPublicacao: true,
          },
        })
      : [];
    const editalMap = new Map(editais.map((e) => [e.id, e]));

    // Resumo IA pronto entre os editais SALVOS (cache, sem IA).
    const exigsComResumo = favIds.length
      ? await this.exigencias.find({
          where: {
            editalId: In(favIds),
            status: ExigenciasStatus.EXTRAIDO,
            resumo: Not(IsNull()),
          },
          select: { editalId: true, updatedAt: true },
        })
      : [];

    const input: AlertasInput = {
      certidoes: certidoes.map((c) => ({
        tipo: c.tipo,
        descricao: c.descricao,
        dataValidade: c.dataValidade,
        updatedAt: c.updatedAt,
      })),
      prazos: editais
        .filter((e) => e.prazoProposta)
        .map((e) => ({
          editalId: e.id,
          objeto: e.objeto,
          prazoProposta: e.prazoProposta as Date,
          dataPublicacao: e.dataPublicacao,
          propostaId: propostaPorEdital.get(e.id) ?? null,
        })),
      resumos: exigsComResumo
        .map((x) => ({
          editalId: x.editalId,
          objeto: editalMap.get(x.editalId)?.objeto ?? '',
          updatedAt: x.updatedAt,
        }))
        .filter((r) => r.objeto),
      resultados: props
        .filter(
          (p) =>
            p.status === PropostaStatus.GANHOU ||
            p.status === PropostaStatus.NAO_GANHOU,
        )
        .map((p) => ({
          propostaId: p.id,
          titulo: p.titulo,
          status: p.status,
          updatedAt: p.updatedAt,
        })),
    };

    const itens = construirAlertas(
      input,
      user?.alertasVistoEm ?? null,
      new Date(),
    );
    return { itens, naoLidos: itens.filter((i) => i.novo).length };
  }

  // Marca tudo como lido = registra a visita agora (zera o sino).
  async marcarLido(userId: string): Promise<void> {
    await this.users.update({ id: userId }, { alertasVistoEm: new Date() });
  }
}
