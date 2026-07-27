import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { GoogleVerifierService } from '../auth/google/google-verifier.service';
import { User } from '../users/user.entity';

// Janela do "modo sudo" do admin (T-183). Decisão do dono: step-up POR SESSÃO —
// desbloqueia uma vez e vale até deslogar (o logout limpa o campo, T-183). A
// janela é longa (casa com o TTL do refresh, 7 dias) só como teto de segurança
// caso a sessão viva mais que isso; na prática quem fecha é o logout.
const STEPUP_JANELA_MS = 7 * 24 * 60 * 60 * 1000;

export interface StepUpStatus {
  ativo: boolean;
  expiraEm: Date | null;
}

// Step-up de autenticação do admin (T-183). Reconfirma a senha antes de ações
// destrutivas — defende contra uma SESSÃO de admin roubada (o AdminGuard só
// garante "é admin", não "é você agora"). "Modo sudo" com janela curta em coluna
// do próprio usuário (à prova de hibernação; sem token/cookie novo para roubar).
@Injectable()
export class AdminStepUpService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly google: GoogleVerifierService,
  ) {}

  // Reconfirma a senha e abre a janela de step-up. Erra fechado: senha errada ou
  // conta sem senha (só Google) → não destrava. Conta só-Google usa
  // confirmarComGoogle.
  async confirmar(
    userId: string,
    senha: string,
    now: Date = new Date(),
  ): Promise<StepUpStatus> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Sessão inválida.');
    if (!user.passwordHash) {
      // Conta só-Google não tem senha — o caminho dela é confirmarComGoogle.
      throw new BadRequestException(
        'Esta conta não tem senha para reconfirmar (login social). Use a confirmação pelo Google.',
      );
    }
    if (!(await bcrypt.compare(senha, user.passwordHash))) {
      throw new UnauthorizedException('Senha incorreta.');
    }
    return this.abrirJanela(userId, now);
  }

  // Step-up de conta só-Google (T-183): reconfirma a IDENTIDADE por um id_token
  // fresco do Google (popup do SDK), espelhando a re-autenticação da exclusão de
  // conta (T-126). Erra fechado: sub que não é o desta conta → não destrava.
  async confirmarComGoogle(
    userId: string,
    idToken: string,
    now: Date = new Date(),
  ): Promise<StepUpStatus> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Sessão inválida.');
    if (!user.googleSub) {
      throw new BadRequestException(
        'Esta conta não está vinculada ao Google. Reconfirme pela senha.',
      );
    }
    const identity = await this.google.verificar(idToken);
    // O id_token precisa ser DESTA conta — o `sub` é o id estável da pessoa no
    // Google, imune a troca de e-mail (mesma checagem da exclusão de conta).
    if (identity.sub !== user.googleSub) {
      throw new UnauthorizedException('Confirmação do Google não confere.');
    }
    return this.abrirJanela(userId, now);
  }

  // Abre a janela do "modo sudo" (comum aos dois caminhos de reconfirmação).
  private async abrirJanela(userId: string, now: Date): Promise<StepUpStatus> {
    const ate = new Date(now.getTime() + STEPUP_JANELA_MS);
    await this.users.update(userId, { adminStepupAte: ate });
    return { ativo: true, expiraEm: ate };
  }

  async status(userId: string, now: Date = new Date()): Promise<StepUpStatus> {
    const user = await this.users.findOne({
      where: { id: userId },
      select: { id: true, adminStepupAte: true },
    });
    const ate = user?.adminStepupAte ?? null;
    const ativo = ate != null && ate.getTime() > now.getTime();
    return { ativo, expiraEm: ativo ? ate : null };
  }
}
