import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Uf } from '../common/uf';
import { CompanyPorte } from './company-porte.enum';
import { NotificationPrefs, User } from './user.entity';

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  name: string;
  cnpj: string | null;
  porte: CompanyPorte | null;
  uf: Uf | null;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  findByEmail(email: string): Promise<User | null> {
    return this.users.findOne({ where: { email } });
  }

  findById(id: string): Promise<User | null> {
    return this.users.findOne({ where: { id } });
  }

  create(input: CreateUserInput): Promise<User> {
    const user = this.users.create(input);
    return this.users.save(user);
  }

  // Atualiza as preferências de notificação (T-89) e devolve o usuário salvo.
  async updateNotificationPrefs(
    userId: string,
    prefs: NotificationPrefs,
  ): Promise<User> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }
    user.notificationPrefs = prefs;
    return this.users.save(user);
  }

  // Troca o hash da senha (T-89) — a validação da senha atual fica no auth.
  async updatePasswordHash(
    userId: string,
    passwordHash: string,
  ): Promise<void> {
    await this.users.update({ id: userId }, { passwordHash });
  }

  // UFs distintas dos usuários — alvo da captação orientada à demanda (T-18).
  async findDistinctUfs(): Promise<Uf[]> {
    const rows = await this.users
      .createQueryBuilder('user')
      .select('DISTINCT user.uf', 'uf')
      .where('user.uf IS NOT NULL')
      .getRawMany<{ uf: Uf }>();
    return rows.map((row) => row.uf);
  }
}
