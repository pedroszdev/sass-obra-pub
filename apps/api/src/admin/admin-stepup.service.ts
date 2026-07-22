import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';

// Janela do "modo sudo" do admin (T-183): reconfirmar a senha destrava as ações
// sensíveis por este tempo.
const STEPUP_MINUTOS = 10;

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
  ) {}

  // Reconfirma a senha e abre a janela de step-up. Erra fechado: senha errada ou
  // conta sem senha (só Google) → não destrava.
  async confirmar(
    userId: string,
    senha: string,
    now: Date = new Date(),
  ): Promise<StepUpStatus> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Sessão inválida.');
    if (!user.passwordHash) {
      // Conta só-Google não tem senha para reconfirmar. 2FA seria o caminho, mas
      // está fora da T-183 (adiado); aqui falha claro em vez de destravar à toa.
      throw new BadRequestException(
        'Esta conta não tem senha para reconfirmar (login social).',
      );
    }
    if (!(await bcrypt.compare(senha, user.passwordHash))) {
      throw new UnauthorizedException('Senha incorreta.');
    }
    const ate = new Date(now.getTime() + STEPUP_MINUTOS * 60 * 1000);
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
