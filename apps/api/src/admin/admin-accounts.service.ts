import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThan, Repository } from 'typeorm';
import { Assinatura } from '../assinaturas/assinatura.entity';
import { AssinaturaStatus } from '../assinaturas/assinatura-status.enum';
import { Atestado } from '../company-profile/atestado.entity';
import { Certidao } from '../company-profile/certidao.entity';
import { CompanyProfile } from '../company-profile/company-profile.entity';
import { Favorito } from '../favoritos/favorito.entity';
import { NotificationLog } from '../notificacoes/notification-log.entity';
import { Proposta } from '../propostas/proposta.entity';
import { RefreshToken } from '../auth/refresh-token.entity';
import { User } from '../users/user.entity';

export interface AccountRow {
  id: string;
  email: string;
  name: string;
  cnpj: string | null;
  porte: string | null;
  role: string;
  emailVerificado: boolean;
  createdAt: Date;
  assinatura: { status: string; plano: string } | null;
}

export interface AccountsPage {
  data: AccountRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AccountDetail extends AccountRow {
  termsAcceptedAt: Date | null;
  googleVinculado: boolean;
  perfil: {
    razaoSocial: string | null;
    telefone: string | null;
    capitalSocial: number | null;
    patrimonioLiquido: number | null;
    registro: { tipo: string | null; numero: string | null; uf: string | null };
  } | null;
  assinaturaDetalhe: {
    status: string;
    plano: string;
    trialEndsAt: Date | null;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
    pastDueDesde: Date | null;
    stripeCustomerId: string | null;
    // Concessões manuais do admin (T-185) — visíveis para revogar.
    cortesiaAte: Date | null;
    suspensoEm: Date | null;
  } | null;
  sessoes: { ativas: number; ultimoAcesso: Date | null };
  uso: {
    favoritos: number;
    propostas: number;
    alertasEnviados: number;
    certidoes: number;
    atestados: number;
  };
}

export interface FiltroContas {
  email?: string;
  cnpj?: string;
  status?: AssinaturaStatus;
  emailVerificado?: boolean;
  cadastradoDe?: Date;
  cadastradoAte?: Date;
  page: number;
  pageSize: number;
}

@Injectable()
export class AdminAccountsService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Assinatura)
    private readonly assinaturas: Repository<Assinatura>,
    @InjectRepository(CompanyProfile)
    private readonly perfis: Repository<CompanyProfile>,
    @InjectRepository(Favorito)
    private readonly favoritos: Repository<Favorito>,
    @InjectRepository(Proposta)
    private readonly propostas: Repository<Proposta>,
    @InjectRepository(Certidao)
    private readonly certidoes: Repository<Certidao>,
    @InjectRepository(Atestado)
    private readonly atestados: Repository<Atestado>,
    @InjectRepository(NotificationLog)
    private readonly notificacoes: Repository<NotificationLog>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokens: Repository<RefreshToken>,
  ) {}

  async listar(f: FiltroContas): Promise<AccountsPage> {
    // leftJoin (não AndSelect) só para filtrar por status; a assinatura é
    // carregada à parte para a página (uma por usuário, UNIQUE user_id → sem
    // multiplicar linhas).
    const qb = this.users
      .createQueryBuilder('u')
      .leftJoin('assinaturas', 'a', 'a.user_id = u.id')
      .orderBy('u.created_at', 'DESC')
      .skip((f.page - 1) * f.pageSize)
      .take(f.pageSize);

    if (f.email) qb.andWhere('u.email ILIKE :email', { email: `%${f.email}%` });
    if (f.cnpj) qb.andWhere('u.cnpj LIKE :cnpj', { cnpj: `%${f.cnpj}%` });
    if (f.status) qb.andWhere('a.status = :status', { status: f.status });
    if (f.emailVerificado === true)
      qb.andWhere('u.email_verified_at IS NOT NULL');
    if (f.emailVerificado === false) qb.andWhere('u.email_verified_at IS NULL');
    if (f.cadastradoDe)
      qb.andWhere('u.created_at >= :de', { de: f.cadastradoDe });
    if (f.cadastradoAte)
      qb.andWhere('u.created_at <= :ate', { ate: f.cadastradoAte });

    const [usuarios, total] = await qb.getManyAndCount();
    const porUser = await this.assinaturasPorUser(usuarios.map((u) => u.id));

    return {
      data: usuarios.map((u) => this.linha(u, porUser.get(u.id) ?? null)),
      total,
      page: f.page,
      pageSize: f.pageSize,
    };
  }

  async detalhe(id: string): Promise<AccountDetail> {
    const user = await this.users.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Conta não encontrada.');

    const [assinatura, perfil, sessoesAtivas, ultimaSessao, uso] =
      await Promise.all([
        this.assinaturas.findOne({ where: { userId: id } }),
        this.perfis.findOne({ where: { userId: id } }),
        this.refreshTokens.count({
          where: {
            userId: id,
            revoked: false,
            expiresAt: MoreThan(new Date()),
          },
        }),
        this.refreshTokens.findOne({
          where: { userId: id },
          order: { createdAt: 'DESC' },
        }),
        this.contadoresDeUso(id),
      ]);

    return {
      ...this.linha(user, assinatura),
      termsAcceptedAt: user.termsAcceptedAt,
      googleVinculado: !!user.googleSub,
      perfil: perfil
        ? {
            razaoSocial: perfil.razaoSocial,
            telefone: perfil.telefone,
            capitalSocial: perfil.capitalSocial,
            patrimonioLiquido: perfil.patrimonioLiquido,
            registro: {
              tipo: perfil.registroProfissionalTipo,
              numero: perfil.registroProfissionalNumero,
              uf: perfil.registroProfissionalUf,
            },
          }
        : null,
      assinaturaDetalhe: assinatura
        ? {
            status: assinatura.status,
            plano: assinatura.plano,
            trialEndsAt: assinatura.trialEndsAt,
            currentPeriodEnd: assinatura.currentPeriodEnd,
            cancelAtPeriodEnd: assinatura.cancelAtPeriodEnd,
            pastDueDesde: assinatura.pastDueDesde,
            stripeCustomerId: assinatura.stripeCustomerId,
            cortesiaAte: assinatura.cortesiaAte,
            suspensoEm: assinatura.suspensoEm,
          }
        : null,
      sessoes: {
        ativas: sessoesAtivas,
        ultimoAcesso: ultimaSessao?.createdAt ?? null,
      },
      uso,
    };
  }

  private async assinaturasPorUser(
    ids: string[],
  ): Promise<Map<string, Assinatura>> {
    if (ids.length === 0) return new Map();
    const lista = await this.assinaturas.find({ where: { userId: In(ids) } });
    return new Map(lista.map((a) => [a.userId, a]));
  }

  private async contadoresDeUso(userId: string): Promise<AccountDetail['uso']> {
    const [favoritos, propostas, alertasEnviados, certidoes, atestados] =
      await Promise.all([
        this.favoritos.count({ where: { userId } }),
        this.propostas.count({ where: { userId } }),
        this.notificacoes.count({ where: { userId } }),
        this.certidoes.count({ where: { userId } }),
        this.atestados.count({ where: { userId } }),
      ]);
    return { favoritos, propostas, alertasEnviados, certidoes, atestados };
  }

  private linha(u: User, a: Assinatura | null): AccountRow {
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      cnpj: u.cnpj,
      porte: u.porte ?? null,
      role: u.role,
      emailVerificado: !!u.emailVerifiedAt,
      createdAt: u.createdAt,
      assinatura: a ? { status: a.status, plano: a.plano } : null,
    };
  }
}
