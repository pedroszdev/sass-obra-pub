import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { In, IsNull, Repository } from 'typeorm';
import { GoogleVerifierService } from '../auth/google/google-verifier.service';
import { Uf } from '../common/uf';
import { Atestado } from '../company-profile/atestado.entity';
import { Certidao } from '../company-profile/certidao.entity';
import { CompanyProfile } from '../company-profile/company-profile.entity';
import { Favorito } from '../favoritos/favorito.entity';
import { Municipio } from '../geo/municipio.entity';
import { Proposta } from '../propostas/proposta.entity';
import { AuthProvider } from './auth-provider.enum';
import { CompanyPorte } from './company-porte.enum';
import { UserMunicipio } from './user-municipio.entity';
import { NotificationPrefs, User } from './user.entity';

export interface CreateUserInput {
  email: string;
  // Null quando a conta nasce pelo Google (T-126) — nunca definiu senha.
  passwordHash: string | null;
  name: string;
  cnpj: string | null;
  porte: CompanyPorte | null;
  uf: Uf | null;
  // Instante do aceite dos Termos/Privacidade no cadastro (T-102/LGPD).
  termsAcceptedAt: Date | null;
  // T-126. Ausentes = cadastro local (o default da coluna cuida do provider).
  provider?: AuthProvider;
  googleSub?: string | null;
  // Conta Google nasce verificada: o id_token atesta o e-mail (T-132).
  emailVerifiedAt?: Date | null;
}

// Prova de posse da conta na exclusão (T-102/LGPD + T-126): senha para conta
// local, id_token fresco do Google para conta sem senha.
export type CredencialExclusao =
  | { senha: string; idToken?: undefined }
  | { idToken: string; senha?: undefined };

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
    // Repos do titular para a exportação LGPD (T-102) — dados espalhados.
    @InjectRepository(CompanyProfile)
    private readonly profiles: Repository<CompanyProfile>,
    @InjectRepository(Certidao)
    private readonly certidoes: Repository<Certidao>,
    @InjectRepository(Atestado)
    private readonly atestados: Repository<Atestado>,
    @InjectRepository(Proposta)
    private readonly propostas: Repository<Proposta>,
    @InjectRepository(Favorito)
    private readonly favoritos: Repository<Favorito>,
    // Re-autenticação Google na exclusão de conta sem senha (T-126). Não puxa o
    // AuthModule (que já importa este) — vem do GoogleAuthModule, sem ciclo.
    private readonly google: GoogleVerifierService,
  ) {}

  findByEmail(email: string): Promise<User | null> {
    return this.users.findOne({ where: { email } });
  }

  findById(id: string): Promise<User | null> {
    return this.users.findOne({ where: { id } });
  }

  // Busca pelo `sub` do Google (T-126) — id estável, sobrevive à troca de e-mail.
  findByGoogleSub(googleSub: string): Promise<User | null> {
    return this.users.findOne({ where: { googleSub } });
  }

  // Vincula o Google a uma conta local já existente (T-126, decisão do dono): o
  // e-mail bate e o Google o atesta, então é a mesma pessoa. `provider` NÃO muda
  // — a conta nasceu local e a senha dela continua valendo.
  async linkGoogleSub(userId: string, googleSub: string): Promise<User> {
    await this.users.update({ id: userId }, { googleSub });
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }
    return user;
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

  // Define a UF de atuação (T-126) — conta criada pelo Google nasce sem ela, e a
  // captação orientada à demanda (T-18) depende da UF para rodar.
  async setUf(userId: string, uf: Uf): Promise<User> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }
    user.uf = uf;
    return this.users.save(user);
  }

  // Troca o hash da senha (T-89) — a validação da senha atual fica no auth.
  async updatePasswordHash(
    userId: string,
    passwordHash: string,
  ): Promise<void> {
    await this.users.update({ id: userId }, { passwordHash });
  }

  // Marca o e-mail como verificado (T-132). Idempotente (não sobrescreve a data
  // se já verificado).
  async markEmailVerified(userId: string): Promise<void> {
    await this.users.update(
      { id: userId, emailVerifiedAt: IsNull() },
      { emailVerifiedAt: new Date() },
    );
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

  // Exportação dos dados do titular (T-102/LGPD): tudo que guardamos sobre o
  // usuário, num JSON. NÃO inclui os bytes dos PDFs (baixáveis nos endpoints do
  // cofre) nem o hash da senha. Sem dados de outrem.
  async exportarDados(userId: string): Promise<Record<string, unknown>> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }
    const [profile, certidoes, atestados, propostas, favoritos, municipios] =
      await Promise.all([
        this.profiles.findOne({ where: { userId } }),
        this.certidoes.find({ where: { userId } }),
        this.atestados.find({ where: { userId } }),
        this.propostas.find({ where: { userId } }),
        this.favoritos.find({ where: { userId } }),
        this.getMunicipiosPreferidos(userId),
      ]);
    return {
      exportadoEm: new Date().toISOString(),
      conta: {
        id: user.id,
        email: user.email,
        name: user.name,
        cnpj: user.cnpj,
        porte: user.porte,
        uf: user.uf,
        role: user.role,
        notificationPrefs: user.notificationPrefs,
        termsAcceptedAt: user.termsAcceptedAt,
        createdAt: user.createdAt,
      },
      perfilEmpresa: profile ?? null,
      municipiosAtuacao: municipios,
      certidoes, // sem os bytes do arquivo (só metadados/validade)
      atestados,
      propostas,
      favoritos: favoritos.map((f) => ({
        editalId: f.editalId,
        createdAt: f.createdAt,
      })),
    };
  }

  // Exclusão da conta (T-102/LGPD). Exige prova de posse ATUAL (evita exclusão
  // acidental ou por sessão sequestrada). Hard delete: as FKs ON DELETE CASCADE
  // removem perfil, certidões, atestados (+ arquivos), propostas, favoritos,
  // municípios e refresh tokens.
  //
  // Conta sem senha (Google, T-126) re-autentica com um id_token fresco. Verificar
  // o token não basta: um id_token legítimo de OUTRA pessoa também passa na
  // verificação. O que autoriza é o `sub` bater com o `google_sub` DESTA conta.
  async excluirConta(
    userId: string,
    credencial: CredencialExclusao,
  ): Promise<void> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    if (user.passwordHash) {
      if (
        !credencial.senha ||
        !(await bcrypt.compare(credencial.senha, user.passwordHash))
      ) {
        throw new UnauthorizedException('Senha incorreta');
      }
    } else {
      if (!credencial.idToken || !user.googleSub) {
        throw new UnauthorizedException(
          'Confirme sua identidade com o Google para excluir a conta.',
        );
      }
      const identity = await this.google.verificar(credencial.idToken);
      if (identity.sub !== user.googleSub) {
        throw new UnauthorizedException('Confirmação do Google não confere.');
      }
    }

    await this.users.delete({ id: userId });
  }
}
