import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TRIAL_DIAS } from '../assinaturas/acesso';
import { AppSetting } from './app-setting.entity';

export const BANNER_NIVEIS = ['info', 'aviso', 'critico'] as const;
export type BannerNivel = (typeof BANNER_NIVEIS)[number];

export interface OperationalBanner {
  ativo: boolean;
  nivel: BannerNivel;
  mensagem: string;
}

// Chaves conhecidas do store (T-195). Nunca chave livre do cliente.
const KEY_BANNER = 'operational_banner';
const KEY_TRIAL_DIAS = 'trial_dias';
const KEY_TERMS_VERSION = 'terms_version';

// Tamanho máximo do rótulo de versão dos termos (ex.: "2026-07-27", "1.0").
const TERMS_VERSION_MAX = 40;

// Limites do parâmetro de trial (evita valor absurdo gravado por engano).
const TRIAL_MIN = 1;
const TRIAL_MAX = 90;

const BANNER_PADRAO: OperationalBanner = {
  ativo: false,
  nivel: 'info',
  mensagem: '',
};

// Cache curto do banner público: ele é lido a CADA carga de página (endpoint
// público), então não pode bater no banco toda vez. Invalidado no setBanner.
const CACHE_MS = 30_000;

// Store de configuração operacional (T-195). Módulo NEUTRO (não em admin/) para
// que tanto o admin (escrita) quanto o assinaturas (lê os dias de trial) o usem
// sem ciclo de dependência.
@Injectable()
export class ConfigStoreService {
  private bannerCache: { valor: OperationalBanner; ate: number } | null = null;

  constructor(
    @InjectRepository(AppSetting)
    private readonly repo: Repository<AppSetting>,
  ) {}

  private async ler<T>(key: string): Promise<T | null> {
    const row = await this.repo.findOne({ where: { key } });
    return row ? (row.value as T) : null;
  }

  private async gravar(
    key: string,
    value: unknown,
    adminId: string,
  ): Promise<void> {
    await this.repo.save({ key, value, updatedByAdminId: adminId });
  }

  // ---- Banner global de aviso ----

  async getBanner(): Promise<OperationalBanner> {
    return (await this.ler<OperationalBanner>(KEY_BANNER)) ?? BANNER_PADRAO;
  }

  async setBanner(
    banner: OperationalBanner,
    adminId: string,
  ): Promise<OperationalBanner> {
    await this.gravar(KEY_BANNER, banner, adminId);
    this.bannerCache = null; // invalida — a mudança precisa aparecer já
    return banner;
  }

  // O que o endpoint PÚBLICO expõe: o banner só quando ativo (senão null).
  // Com cache curto porque é lido a cada visita.
  async getBannerPublico(): Promise<OperationalBanner | null> {
    const agora = Date.now();
    if (!this.bannerCache || this.bannerCache.ate < agora) {
      this.bannerCache = {
        valor: await this.getBanner(),
        ate: agora + CACHE_MS,
      };
    }
    return this.bannerCache.valor.ativo ? this.bannerCache.valor : null;
  }

  // ---- Dias de trial (T-127) ----

  // Sobrepõe o default constante (TRIAL_DIAS=7). Sem registro → fallback. Com
  // clamp para nunca aplicar um valor absurdo ao caminho do dinheiro.
  async getTrialDias(): Promise<number> {
    const valor = await this.ler<number>(KEY_TRIAL_DIAS);
    if (typeof valor !== 'number' || !Number.isFinite(valor)) return TRIAL_DIAS;
    return Math.min(TRIAL_MAX, Math.max(TRIAL_MIN, Math.trunc(valor)));
  }

  async setTrialDias(dias: number, adminId: string): Promise<number> {
    const clamped = Math.min(TRIAL_MAX, Math.max(TRIAL_MIN, Math.trunc(dias)));
    await this.gravar(KEY_TRIAL_DIAS, clamped, adminId);
    return clamped;
  }

  // ---- Versão vigente dos termos/privacidade (T-196) ----

  // A versão que os usuários precisam ter aceitado. NULL = versionamento
  // DESLIGADO: ninguém é forçado a re-aceitar (comportamento de hoje). O dono
  // sobe a versão aqui quando publica texto novo (T-179) — o re-aceite passa a
  // valer sozinho. String vazia é normalizada para null (mesma coisa: desligado).
  async getTermsVersion(): Promise<string | null> {
    const valor = await this.ler<string>(KEY_TERMS_VERSION);
    const limpo = typeof valor === 'string' ? valor.trim() : '';
    return limpo ? limpo : null;
  }

  async setTermsVersion(
    versao: string | null,
    adminId: string,
  ): Promise<string | null> {
    const limpo = (versao ?? '').trim().slice(0, TERMS_VERSION_MAX);
    await this.gravar(KEY_TERMS_VERSION, limpo, adminId);
    return limpo ? limpo : null;
  }
}
