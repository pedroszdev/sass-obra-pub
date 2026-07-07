import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Uf } from '../common/uf';
import { Municipio } from '../geo/municipio.entity';
import { CompanyPorte } from './company-porte.enum';
import { UserMunicipio } from './user-municipio.entity';
import { NotificationPrefs, User } from './user.entity';

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  name: string;
  cnpj: string | null;
  porte: CompanyPorte | null;
  uf: Uf | null;
}

// Município de atuação preferido, já resolvido com nome/UF (T-94).
export interface MunicipioPreferido {
  codigoIbge: string;
  nome: string;
  uf: Uf;
}

// Teto de municípios preferidos por usuário — evita abuso e mantém a captação
// por UF enxuta (T-94).
const MAX_MUNICIPIOS_PREFERIDOS = 20;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(UserMunicipio)
    private readonly userMunicipios: Repository<UserMunicipio>,
    @InjectRepository(Municipio)
    private readonly municipios: Repository<Municipio>,
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

  // UFs distintas alvo da captação orientada à demanda (T-18): a `uf` de cadastro
  // dos usuários UNIÃO as UFs dos municípios preferidos (T-94) — assim um
  // município escolhido em outra UF também é captado (senão a Home filtraria por
  // um município sem edital no banco).
  async findDistinctUfs(): Promise<Uf[]> {
    const [ufsCadastro, ufsMunicipios] = await Promise.all([
      this.users
        .createQueryBuilder('user')
        .select('DISTINCT user.uf', 'uf')
        .where('user.uf IS NOT NULL')
        .getRawMany<{ uf: Uf }>(),
      this.userMunicipios
        .createQueryBuilder('um')
        .innerJoin(Municipio, 'm', 'm.codigo_ibge = um.codigo_ibge')
        .select('DISTINCT m.uf', 'uf')
        .getRawMany<{ uf: Uf }>(),
    ]);
    const set = new Set<Uf>();
    for (const r of ufsCadastro) set.add(r.uf);
    for (const r of ufsMunicipios) set.add(r.uf);
    return [...set];
  }

  // Municípios de atuação preferidos do usuário (T-94), resolvidos com nome/UF
  // e ordenados por nome.
  async getMunicipiosPreferidos(userId: string): Promise<MunicipioPreferido[]> {
    return this.userMunicipios
      .createQueryBuilder('um')
      .innerJoin(Municipio, 'm', 'm.codigo_ibge = um.codigo_ibge')
      .select('m.codigo_ibge', 'codigoIbge')
      .addSelect('m.nome', 'nome')
      .addSelect('m.uf', 'uf')
      .where('um.user_id = :userId', { userId })
      .orderBy('m.nome', 'ASC')
      .getRawMany<MunicipioPreferido>();
  }

  // Substitui o conjunto de municípios preferidos (T-94). Valida que todos os
  // códigos existem no IBGE (código desconhecido → 400) e respeita o teto.
  // Semântica de replace (transação): o PUT manda a lista completa desejada.
  async setMunicipiosPreferidos(
    userId: string,
    codigos: string[],
  ): Promise<MunicipioPreferido[]> {
    const unicos = [...new Set(codigos)];
    if (unicos.length > MAX_MUNICIPIOS_PREFERIDOS) {
      throw new BadRequestException(
        `Escolha no máximo ${MAX_MUNICIPIOS_PREFERIDOS} municípios.`,
      );
    }
    if (unicos.length > 0) {
      const existentes = await this.municipios.count({
        where: { codigoIbge: In(unicos) },
      });
      if (existentes !== unicos.length) {
        throw new BadRequestException(
          'Um ou mais municípios informados não existem.',
        );
      }
    }

    await this.userMunicipios.manager.transaction(async (manager) => {
      await manager.delete(UserMunicipio, { userId });
      if (unicos.length > 0) {
        await manager.insert(
          UserMunicipio,
          unicos.map((codigoIbge) => ({ userId, codigoIbge })),
        );
      }
    });

    return this.getMunicipiosPreferidos(userId);
  }
}
