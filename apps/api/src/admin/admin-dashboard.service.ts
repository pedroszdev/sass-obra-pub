import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, MoreThanOrEqual, Repository } from 'typeorm';
import { Assinatura } from '../assinaturas/assinatura.entity';
import { AssinaturaStatus } from '../assinaturas/assinatura-status.enum';
import { Edital } from '../editais/edital.entity';
import { NotificationLog } from '../notificacoes/notification-log.entity';
import { User } from '../users/user.entity';

const DIA_MS = 24 * 60 * 60 * 1000;

export interface TrialExpirando {
  id: string;
  email: string;
  trialEndsAt: Date | null;
}

export interface ResumoAdmin {
  assinaturas: {
    pagantes: number;
    emTrial: number;
    pastDue: number;
    canceladas: number;
  };
  // Trials que expiram em ≤48h — a lista de "quem ligar hoje".
  trialsExpirando: { total: number; contas: TrialExpirando[] };
  cadastros: { hoje: number; ultimos7d: number };
  produto: { editaisHoje: number; alertasHoje: number };
  // Marco temporal usado (início do dia, UTC) — o front mostra a ressalva.
  geradoEm: Date;
}

// Home do admin (T-194 v1). Só os números que JÁ existem no banco — MRR (preço
// vive na Stripe), custo de IA (T-190) e funil/coorte de conversão ficam para as
// entregas seguintes. "Hoje" = desde o início do dia UTC (o front avisa).
@Injectable()
export class AdminDashboardService {
  constructor(
    @InjectRepository(Assinatura)
    private readonly assinaturas: Repository<Assinatura>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Edital) private readonly editais: Repository<Edital>,
    @InjectRepository(NotificationLog)
    private readonly notificacoes: Repository<NotificationLog>,
  ) {}

  async resumo(now: Date = new Date()): Promise<ResumoAdmin> {
    const inicioDoDia = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const seteDiasAtras = new Date(now.getTime() - 7 * DIA_MS);
    const daquiA48h = new Date(now.getTime() + 2 * DIA_MS);

    const [
      pagantes,
      emTrial,
      pastDue,
      canceladas,
      expirando,
      hoje,
      ultimos7d,
      editaisHoje,
      alertasHoje,
    ] = await Promise.all([
      this.assinaturas.count({ where: { status: AssinaturaStatus.ACTIVE } }),
      this.assinaturas.count({ where: { status: AssinaturaStatus.TRIALING } }),
      this.assinaturas.count({ where: { status: AssinaturaStatus.PAST_DUE } }),
      this.assinaturas.count({ where: { status: AssinaturaStatus.CANCELED } }),
      this.assinaturas.find({
        where: {
          status: AssinaturaStatus.TRIALING,
          trialEndsAt: Between(now, daquiA48h),
        },
        order: { trialEndsAt: 'ASC' },
        take: 50,
      }),
      this.users.count({ where: { createdAt: MoreThanOrEqual(inicioDoDia) } }),
      this.users.count({
        where: { createdAt: MoreThanOrEqual(seteDiasAtras) },
      }),
      this.editais.count({
        where: { createdAt: MoreThanOrEqual(inicioDoDia) },
      }),
      this.notificacoes.count({
        where: { sentAt: MoreThanOrEqual(inicioDoDia) },
      }),
    ]);

    return {
      assinaturas: { pagantes, emTrial, pastDue, canceladas },
      trialsExpirando: {
        total: expirando.length,
        contas: await this.comEmail(expirando),
      },
      cadastros: { hoje, ultimos7d },
      produto: { editaisHoje, alertasHoje },
      geradoEm: now,
    };
  }

  private async comEmail(assinaturas: Assinatura[]): Promise<TrialExpirando[]> {
    if (assinaturas.length === 0) return [];
    const ids = assinaturas.map((a) => a.userId);
    const users = await this.users.find({ where: { id: In(ids) } });
    const email = new Map(users.map((u) => [u.id, u.email]));
    return assinaturas.map((a) => ({
      id: a.userId,
      email: email.get(a.userId) ?? '(desconhecido)',
      trialEndsAt: a.trialEndsAt,
    }));
  }
}
