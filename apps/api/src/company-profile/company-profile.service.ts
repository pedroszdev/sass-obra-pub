import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Atestado } from './atestado.entity';
import { Certidao } from './certidao.entity';
import { CertidaoTipo } from './certidao-tipo.enum';
import { CompanyProfile } from './company-profile.entity';
import {
  AtestadoResponse,
  CertidaoResponse,
  CompanyProfileResponse,
  CompanyProfileSnapshot,
  toAtestadoResponse,
  toCertidaoResponse,
  toCompanyProfileResponse,
} from './dto/company-profile-response';
import { CreateAtestadoDto } from './dto/create-atestado.dto';
import { CreateCertidaoDto } from './dto/create-certidao.dto';
import { UpdateAtestadoDto } from './dto/update-atestado.dto';
import { UpdateCertidaoDto } from './dto/update-certidao.dto';
import { UpsertCompanyProfileDto } from './dto/upsert-company-profile.dto';

// Copia só os campos definidos do DTO para a entidade (merge de PUT parcial):
// campos ausentes no body chegam como undefined e não devem zerar o que existe.
function applyDefined<T>(target: T, patch: Partial<T>): void {
  for (const key of Object.keys(patch) as (keyof T)[]) {
    if (patch[key] !== undefined) {
      target[key] = patch[key] as T[keyof T];
    }
  }
}

@Injectable()
export class CompanyProfileService {
  constructor(
    @InjectRepository(CompanyProfile)
    private readonly profiles: Repository<CompanyProfile>,
    @InjectRepository(Certidao)
    private readonly certidoes: Repository<Certidao>,
    @InjectRepository(Atestado)
    private readonly atestados: Repository<Atestado>,
  ) {}

  // Snapshot do perfil do usuário: escalares + certidões + atestados, numa só
  // resposta (uma chamada para a tela do cofre, T-42). profile = null se ainda
  // não foi criado (criação preguiçosa no 1º PUT).
  async getFull(userId: string): Promise<CompanyProfileSnapshot> {
    const [profile, certidoes, atestados] = await Promise.all([
      this.profiles.findOne({ where: { userId } }),
      this.certidoes.find({ where: { userId }, order: { createdAt: 'DESC' } }),
      this.atestados.find({ where: { userId }, order: { createdAt: 'DESC' } }),
    ]);
    return {
      profile: profile ? toCompanyProfileResponse(profile) : null,
      certidoes: certidoes.map(toCertidaoResponse),
      atestados: atestados.map(toAtestadoResponse),
    };
  }

  // Upsert dos escalares do perfil (1:1). Cria no 1º PUT, depois faz merge.
  async upsertProfile(
    userId: string,
    dto: UpsertCompanyProfileDto,
  ): Promise<CompanyProfileResponse> {
    const profile =
      (await this.profiles.findOne({ where: { userId } })) ??
      this.profiles.create({ userId });
    applyDefined(profile, dto);
    const saved = await this.profiles.save(profile);
    return toCompanyProfileResponse(saved);
  }

  async addCertidao(
    userId: string,
    dto: CreateCertidaoDto,
  ): Promise<CertidaoResponse> {
    this.assertOutraTemDescricao(dto.tipo, dto.descricao);
    const certidao = this.certidoes.create({ ...dto, userId });
    return toCertidaoResponse(await this.certidoes.save(certidao));
  }

  async updateCertidao(
    userId: string,
    id: string,
    dto: UpdateCertidaoDto,
  ): Promise<CertidaoResponse> {
    const certidao = await this.certidoes.findOne({ where: { id, userId } });
    if (!certidao) {
      throw new NotFoundException('Certidão não encontrada');
    }
    // Valida com o estado final (após o merge), não só com o que veio no body.
    this.assertOutraTemDescricao(
      dto.tipo ?? certidao.tipo,
      dto.descricao !== undefined ? dto.descricao : certidao.descricao,
    );
    applyDefined(certidao, dto);
    return toCertidaoResponse(await this.certidoes.save(certidao));
  }

  async removeCertidao(userId: string, id: string): Promise<void> {
    const { affected } = await this.certidoes.delete({ id, userId });
    if (!affected) {
      throw new NotFoundException('Certidão não encontrada');
    }
  }

  async addAtestado(
    userId: string,
    dto: CreateAtestadoDto,
  ): Promise<AtestadoResponse> {
    const atestado = this.atestados.create({ ...dto, userId });
    return toAtestadoResponse(await this.atestados.save(atestado));
  }

  async updateAtestado(
    userId: string,
    id: string,
    dto: UpdateAtestadoDto,
  ): Promise<AtestadoResponse> {
    const atestado = await this.atestados.findOne({ where: { id, userId } });
    if (!atestado) {
      throw new NotFoundException('Atestado não encontrado');
    }
    applyDefined(atestado, dto);
    return toAtestadoResponse(await this.atestados.save(atestado));
  }

  async removeAtestado(userId: string, id: string): Promise<void> {
    const { affected } = await this.atestados.delete({ id, userId });
    if (!affected) {
      throw new NotFoundException('Atestado não encontrado');
    }
  }

  // Regra de negócio: certidão do tipo OUTRA precisa dizer qual é (descricao).
  private assertOutraTemDescricao(
    tipo: CertidaoTipo,
    descricao: string | null | undefined,
  ): void {
    if (tipo === CertidaoTipo.OUTRA && !descricao?.trim()) {
      throw new BadRequestException(
        'descricao é obrigatória quando tipo é OUTRA',
      );
    }
  }
}
