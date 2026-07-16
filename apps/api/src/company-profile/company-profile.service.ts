import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Atestado } from './atestado.entity';
import { AtestadoArquivo } from './atestado-arquivo.entity';
import { Certidao } from './certidao.entity';
import { CertidaoArquivo } from './certidao-arquivo.entity';
import {
  ARQUIVO_MIMES_PERMITIDOS,
  ARQUIVO_TAMANHO_MAX,
  clampNomeArquivo,
  detectarMimePorConteudo,
  UploadedPdf,
} from './certidao-arquivo.constants';
import { SearchEditaisDto } from '../editais/dto/search-editais.dto';
import { EditaisSearchService } from '../editais/editais-search.service';
import { ExigenciasStatus } from '../editais/exigencias/edital-exigencias.entity';
import { ExigenciasService } from '../editais/exigencias/exigencias.service';
import { UsersService } from '../users/users.service';
import { CertidaoTipo } from './certidao-tipo.enum';
import { CompanyProfile } from './company-profile.entity';
import {
  diagnosticarEdital,
  DiagnosticoEditalResponse,
  EditaisAptosResult,
  EditalAptoItem,
} from './habilitacao/diagnostico-edital';
import { ProntidaoInput } from './habilitacao/habilitacao-checks';
import { avaliarProntidao, ProntidaoResult } from './habilitacao/prontidao';
import {
  ArquivoMeta,
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
    @InjectRepository(CertidaoArquivo)
    private readonly arquivos: Repository<CertidaoArquivo>,
    @InjectRepository(AtestadoArquivo)
    private readonly atestadoArquivos: Repository<AtestadoArquivo>,
    // Exigências extraídas do edital (T-49), para o diagnóstico específico (T-51).
    private readonly exigenciasService: ExigenciasService,
    // Busca de editais (T-20), para o filtro de aptidão (T-53).
    private readonly editaisSearch: EditaisSearchService,
    // UF da sede do empreiteiro para o guia de regularização (T-111).
    private readonly users: UsersService,
  ) {}

  // Snapshot do perfil do usuário: escalares + certidões + atestados, numa só
  // resposta (uma chamada para a tela do cofre, T-42). profile = null se ainda
  // não foi criado (criação preguiçosa no 1º PUT). Cada certidão traz os
  // metadados do arquivo anexado (sem os bytes — esses só viajam no download).
  async getFull(userId: string): Promise<CompanyProfileSnapshot> {
    const [profile, certidoes, atestados] = await Promise.all([
      this.profiles.findOne({ where: { userId } }),
      this.certidoes.find({ where: { userId }, order: { createdAt: 'DESC' } }),
      this.atestados.find({ where: { userId }, order: { createdAt: 'DESC' } }),
    ]);
    const [arquivoPorCertidao, arquivoPorAtestado] = await Promise.all([
      this.loadArquivoMetas(certidoes.map((c) => c.id)),
      this.loadAtestadoArquivoMetas(atestados.map((a) => a.id)),
    ]);
    return {
      profile: profile ? toCompanyProfileResponse(profile) : null,
      certidoes: certidoes.map((c) =>
        toCertidaoResponse(c, arquivoPorCertidao.get(c.id) ?? null),
      ),
      atestados: atestados.map((a) =>
        toAtestadoResponse(a, arquivoPorAtestado.get(a.id) ?? null),
      ),
    };
  }

  // Diagnóstico de prontidão genérica (BACKLOG T-45): cruza o perfil com o
  // catálogo de requisitos (T-44) via o motor puro. Carrega só o necessário
  // (conta atestados em vez de trazê-los).
  async getProntidaoGenerica(userId: string): Promise<ProntidaoResult> {
    return avaliarProntidao(await this.loadProntidaoInput(userId));
  }

  // Diagnóstico específico do usuário para UM edital (T-51): cruza as exigências
  // extraídas (T-49) com o perfil. Se o edital ainda não tem exigências
  // (indisponível/erro), devolve diagnostico=null + status, para a tela explicar.
  async getDiagnosticoEdital(
    userId: string,
    editalId: string,
  ): Promise<DiagnosticoEditalResponse> {
    const exig = await this.exigenciasService.getOrExtract(editalId);
    if (exig.status !== ExigenciasStatus.EXTRAIDO || !exig.exigencias) {
      return {
        editalId,
        exigenciasStatus: exig.status,
        atualizadoEm: exig.updatedAt,
        diagnostico: null,
      };
    }
    const input = await this.loadProntidaoInput(userId);
    // valorEstimado do edital alimenta o capital mínimo em % (T-116a).
    const edital = await this.editaisSearch.findById(editalId);
    return {
      editalId,
      exigenciasStatus: exig.status,
      atualizadoEm: exig.updatedAt,
      diagnostico: diagnosticarEdital(
        exig.exigencias,
        input,
        undefined,
        edital.valorEstimado,
        edital.prazoProposta,
      ),
    };
  }

  // Filtro "só editais que estou apto" (T-53): cruza os filtros da busca com a
  // aptidão do usuário, sobre editais JÁ EXTRAÍDOS (sem IA na busca, §3.4).
  // Retorna apto + quase, paginado, com o veredito por item.
  async getEditaisAptos(
    userId: string,
    dto: SearchEditaisDto,
  ): Promise<EditaisAptosResult> {
    const input = await this.loadProntidaoInput(userId);
    const candidatos = await this.editaisSearch.findEditaisComExigencias(dto); // já ordenado por data

    const aptos: EditalAptoItem[] = [];
    for (const c of candidatos) {
      const { veredito } = diagnosticarEdital(
        c.exigencias,
        input,
        undefined,
        c.edital.valorEstimado,
      );
      if (veredito === 'apto' || veredito === 'quase') {
        aptos.push({ ...c.edital, veredito });
      }
    }

    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? 20;
    const start = (page - 1) * pageSize;
    return {
      data: aptos.slice(start, start + pageSize),
      total: aptos.length,
      page,
      pageSize,
    };
  }

  // Carrega os dados do perfil usados nos diagnósticos (T-45 e T-51).
  private async loadProntidaoInput(userId: string): Promise<ProntidaoInput> {
    const [profile, certidoes, atestadosCount, user] = await Promise.all([
      this.profiles.findOne({ where: { userId } }),
      this.certidoes.find({ where: { userId } }),
      this.atestados.count({ where: { userId } }),
      this.users.findById(userId), // UF da sede → guia de regularização (T-111)
    ]);
    return {
      certidoes: certidoes.map((c) => ({
        tipo: c.tipo,
        dataValidade: c.dataValidade,
      })),
      atestadosCount,
      capitalSocial: profile?.capitalSocial ?? null,
      patrimonioLiquido: profile?.patrimonioLiquido ?? null,
      registroProfissionalTipo: profile?.registroProfissionalTipo ?? null,
      registroProfissionalNumero: profile?.registroProfissionalNumero ?? null,
      uf: user?.uf ?? null,
    };
  }

  // Metadados dos arquivos das certidões informadas — SEM selecionar o conteudo
  // (bytea), para a listagem ficar leve.
  private async loadArquivoMetas(
    certidaoIds: string[],
  ): Promise<Map<string, ArquivoMeta>> {
    if (certidaoIds.length === 0) return new Map();
    const arquivos = await this.arquivos.find({
      where: { certidaoId: In(certidaoIds) },
      select: {
        certidaoId: true,
        nomeArquivo: true,
        mimeType: true,
        tamanhoBytes: true,
      },
    });
    return new Map(
      arquivos.map((a) => [
        a.certidaoId,
        {
          nomeArquivo: a.nomeArquivo,
          mimeType: a.mimeType,
          tamanhoBytes: a.tamanhoBytes,
        },
      ]),
    );
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

  // Anexa (ou substitui) o arquivo da certidão. 1:1 — re-upload sobrescreve.
  // Escopado ao dono via a certidão (404 se não for dele).
  async uploadArquivo(
    userId: string,
    certidaoId: string,
    file: UploadedPdf,
  ): Promise<ArquivoMeta> {
    await this.assertCertidaoDoUsuario(userId, certidaoId);
    const mimeType = this.validateArquivo(file);

    const existente = await this.arquivos.findOne({
      where: { certidaoId },
      select: { id: true },
    });
    const arquivo = this.arquivos.create({
      id: existente?.id,
      certidaoId,
      nomeArquivo: clampNomeArquivo(file.originalname),
      mimeType,
      tamanhoBytes: file.buffer.length,
      conteudo: file.buffer,
    });
    const saved = await this.arquivos.save(arquivo);
    return {
      nomeArquivo: saved.nomeArquivo,
      mimeType: saved.mimeType,
      tamanhoBytes: saved.tamanhoBytes,
    };
  }

  // Carrega o arquivo COM o conteudo (para o download). 404 se a certidão não
  // for do usuário ou não houver arquivo.
  async getArquivo(
    userId: string,
    certidaoId: string,
  ): Promise<CertidaoArquivo> {
    await this.assertCertidaoDoUsuario(userId, certidaoId);
    const arquivo = await this.arquivos.findOne({ where: { certidaoId } });
    if (!arquivo) {
      throw new NotFoundException('Arquivo não encontrado');
    }
    return arquivo;
  }

  async removeArquivo(userId: string, certidaoId: string): Promise<void> {
    await this.assertCertidaoDoUsuario(userId, certidaoId);
    const { affected } = await this.arquivos.delete({ certidaoId });
    if (!affected) {
      throw new NotFoundException('Arquivo não encontrado');
    }
  }

  private async assertCertidaoDoUsuario(
    userId: string,
    certidaoId: string,
  ): Promise<void> {
    const existe = await this.certidoes.count({
      where: { id: certidaoId, userId },
    });
    if (existe === 0) {
      throw new NotFoundException('Certidão não encontrada');
    }
  }

  // Valida o arquivo e devolve o mime REAL (o do conteúdo), que é o que os
  // chamadores gravam. Devolver em vez de só validar não é detalhe: guardar o
  // `file.mimetype` (declarado pelo cliente, contornável por curl) permitia
  // gravar um PDF rotulado como image/png e o download depois servia um
  // Content-Type mentiroso. Guarde o que foi verificado, não o que foi dito.
  private validateArquivo(file: UploadedPdf): string {
    if (!ARQUIVO_MIMES_PERMITIDOS.includes(file.mimetype)) {
      throw new BadRequestException(
        'Tipo de arquivo não suportado (envie PDF, JPG ou PNG)',
      );
    }
    if (file.buffer.length > ARQUIVO_TAMANHO_MAX) {
      throw new BadRequestException('Arquivo excede o limite de 10 MB');
    }
    // Valida o CONTEÚDO por magic bytes (T-119e): o mimetype declarado é
    // contornável (curl). O começo do arquivo tem que ser de fato PDF/JPG/PNG.
    const tipoReal = detectarMimePorConteudo(file.buffer);
    if (!tipoReal || !ARQUIVO_MIMES_PERMITIDOS.includes(tipoReal)) {
      throw new BadRequestException(
        'O conteúdo do arquivo não é um PDF, JPG ou PNG válido',
      );
    }
    // Declarado e real precisam bater: os dois passarem pela allowlist não basta
    // se um diz PNG e o outro é PDF — nesse caso o envio está errado, não há o
    // que adivinhar.
    if (tipoReal !== file.mimetype) {
      throw new BadRequestException(
        'O conteúdo do arquivo não corresponde ao tipo informado',
      );
    }
    return tipoReal;
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

  // --- Arquivo da CAT/atestado (T-134) — espelha o storage das certidões (T-41b) ---

  // Anexa (ou substitui) o PDF/imagem da CAT do atestado. 1:1 — re-upload
  // sobrescreve. Escopado ao dono via o atestado (404 se não for dele).
  async uploadAtestadoArquivo(
    userId: string,
    atestadoId: string,
    file: UploadedPdf,
  ): Promise<ArquivoMeta> {
    await this.assertAtestadoDoUsuario(userId, atestadoId);
    const mimeType = this.validateArquivo(file);

    const existente = await this.atestadoArquivos.findOne({
      where: { atestadoId },
      select: { id: true },
    });
    const arquivo = this.atestadoArquivos.create({
      id: existente?.id,
      atestadoId,
      nomeArquivo: clampNomeArquivo(file.originalname),
      mimeType,
      tamanhoBytes: file.buffer.length,
      conteudo: file.buffer,
    });
    const saved = await this.atestadoArquivos.save(arquivo);
    return {
      nomeArquivo: saved.nomeArquivo,
      mimeType: saved.mimeType,
      tamanhoBytes: saved.tamanhoBytes,
    };
  }

  // Carrega o arquivo COM o conteudo (para o download). 404 se o atestado não
  // for do usuário ou não houver arquivo.
  async getAtestadoArquivo(
    userId: string,
    atestadoId: string,
  ): Promise<AtestadoArquivo> {
    await this.assertAtestadoDoUsuario(userId, atestadoId);
    const arquivo = await this.atestadoArquivos.findOne({
      where: { atestadoId },
    });
    if (!arquivo) {
      throw new NotFoundException('Arquivo não encontrado');
    }
    return arquivo;
  }

  async removeAtestadoArquivo(
    userId: string,
    atestadoId: string,
  ): Promise<void> {
    await this.assertAtestadoDoUsuario(userId, atestadoId);
    const { affected } = await this.atestadoArquivos.delete({ atestadoId });
    if (!affected) {
      throw new NotFoundException('Arquivo não encontrado');
    }
  }

  private async assertAtestadoDoUsuario(
    userId: string,
    atestadoId: string,
  ): Promise<void> {
    const existe = await this.atestados.count({
      where: { id: atestadoId, userId },
    });
    if (existe === 0) {
      throw new NotFoundException('Atestado não encontrado');
    }
  }

  // Metadados dos arquivos dos atestados — SEM o conteudo (bytea), listagem leve.
  private async loadAtestadoArquivoMetas(
    atestadoIds: string[],
  ): Promise<Map<string, ArquivoMeta>> {
    if (atestadoIds.length === 0) return new Map();
    const arquivos = await this.atestadoArquivos.find({
      where: { atestadoId: In(atestadoIds) },
      select: {
        atestadoId: true,
        nomeArquivo: true,
        mimeType: true,
        tamanhoBytes: true,
      },
    });
    return new Map(
      arquivos.map((a) => [
        a.atestadoId,
        {
          nomeArquivo: a.nomeArquivo,
          mimeType: a.mimeType,
          tamanhoBytes: a.tamanhoBytes,
        },
      ]),
    );
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
