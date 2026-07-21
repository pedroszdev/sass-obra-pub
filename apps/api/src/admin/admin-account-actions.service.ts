import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthService } from '../auth/auth.service';
import { RefreshToken } from '../auth/refresh-token.entity';
import { Assinatura } from '../assinaturas/assinatura.entity';
import { AssinaturaStatus } from '../assinaturas/assinatura-status.enum';

const DIA_MS = 24 * 60 * 60 * 1000;

// Ações de conta do admin (T-185). Toda mutação aqui é auditada pelo interceptor
// (§T-182) — o controller anota o rótulo. As concessões (cortesia/suspensão)
// vivem na entidade Assinatura e alimentam calcularAcesso; ficam FORA do
// montarPatch, então a reconciliação da Stripe não as apaga.
@Injectable()
export class AdminAccountActionsService {
  constructor(
    @InjectRepository(Assinatura)
    private readonly assinaturas: Repository<Assinatura>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokens: Repository<RefreshToken>,
    private readonly auth: AuthService,
  ) {}

  // Estende o trial: soma `dias` a partir do maior entre agora e o fim atual (não
  // encurta um trial ainda em curso). SÓ para status trialing — para conta ativa/
  // cancelada, a ferramenta é a cortesia (decisão do dono).
  async estenderTrial(
    userId: string,
    dias: number,
    now: Date = new Date(),
  ): Promise<void> {
    const a = await this.carregar(userId);
    if (a.status !== AssinaturaStatus.TRIALING) {
      throw new BadRequestException(
        'Só dá para estender o trial de uma conta em teste. Para conta paga/cancelada, use cortesia.',
      );
    }
    const base =
      a.trialEndsAt && a.trialEndsAt.getTime() > now.getTime()
        ? a.trialEndsAt
        : now;
    a.trialEndsAt = new Date(base.getTime() + dias * DIA_MS);
    await this.assinaturas.save(a);
  }

  // Concede cortesia: libera o produto sem cartão por `dias` a partir de agora.
  async concederCortesia(
    userId: string,
    dias: number,
    now: Date = new Date(),
  ): Promise<void> {
    const a = await this.carregar(userId);
    a.cortesiaAte = new Date(now.getTime() + dias * DIA_MS);
    await this.assinaturas.save(a);
  }

  async revogarCortesia(userId: string): Promise<void> {
    const a = await this.carregar(userId);
    a.cortesiaAte = null;
    await this.assinaturas.save(a);
  }

  async suspender(userId: string, now: Date = new Date()): Promise<void> {
    const a = await this.carregar(userId);
    if (!a.suspensoEm) {
      a.suspensoEm = now;
      await this.assinaturas.save(a);
    }
  }

  async reativar(userId: string): Promise<void> {
    const a = await this.carregar(userId);
    a.suspensoEm = null;
    await this.assinaturas.save(a);
  }

  // Reenvia a verificação de e-mail. Reusa o fluxo do auth (no-op se já
  // verificado ou usuário inexistente) — não duplica a lógica de token/e-mail.
  async reenviarVerificacao(userId: string): Promise<void> {
    await this.auth.resendVerification(userId);
  }

  // Revoga TODAS as sessões da conta (resposta a "acho que invadiram minha
  // conta"). O usuário perde o acesso no próximo refresh.
  async revogarSessoes(userId: string): Promise<void> {
    await this.refreshTokens.update({ userId }, { revoked: true });
  }

  private async carregar(userId: string): Promise<Assinatura> {
    const a = await this.assinaturas.findOne({ where: { userId } });
    if (!a) throw new NotFoundException('Assinatura da conta não encontrada.');
    return a;
  }
}
