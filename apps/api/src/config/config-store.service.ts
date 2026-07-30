import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TRIAL_DIAS } from '../assinaturas/acesso';
import { AppSetting } from './app-setting.entity';

export const BANNER_NIVEIS = ['info', 'aviso', 'critico'] as const;
export type BannerNivel = (typeof BANNER_NIVEIS)[number];

/** Preço dos planos, SEMPRE em centavos (a unidade do resto do projeto). */
export interface PrecosAssinatura {
  mensalCentavos: number;
  anualCentavos: number;
}

export interface OperationalBanner {
  ativo: boolean;
  nivel: BannerNivel;
  mensagem: string;
}

// Chaves conhecidas do store (T-195). Nunca chave livre do cliente.
const KEY_BANNER = 'operational_banner';
const KEY_TRIAL_DIAS = 'trial_dias';
const KEY_TERMS_VERSION = 'terms_version';
const KEY_PRECOS = 'precos_assinatura';

// Tamanho máximo do rótulo de versão dos termos (ex.: "2026-07-27", "1.0").
const TERMS_VERSION_MAX = 40;

// Limites do parâmetro de trial (evita valor absurdo gravado por engano).
const TRIAL_MIN = 1;
const TRIAL_MAX = 90;

// Limites do PREÇO, em centavos (T-213). Mesmo espírito do clamp do trial: é
// caminho do dinheiro, e um valor absurdo gravado por engano vira cobrança
// absurda no cartão de um cliente. R$ 1,00 a R$ 10.000,00.
const PRECO_MIN_CENTAVOS = 100;
const PRECO_MAX_CENTAVOS = 1_000_000;

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

  // ---- Preço da assinatura (T-213, Épico 17) ----
  //
  // 🔴 ISTO REVOGA A REGRA DO §8 ("o preço nunca é escrito do nosso lado"), e a
  // revogação é forçada pelo provedor, não por preferência: aquela regra nasceu
  // da Stripe, que tem catálogo de `Price` e cobra o que está lá. **O Asaas não
  // tem catálogo** — a assinatura carrega um `value` que NÓS mandamos. Não há
  // "lá" de onde ler.
  //
  // O ESPÍRITO da regra sobrevive por morar aqui e não no código: muda sem
  // deploy, e o `updatedByAdminId` registra quem mudou (o Dashboard da Stripe
  // também registrava). Constante no código exigiria commit para mudar preço.
  //
  // ⚠️ SEMPRE EM CENTAVOS, como todo o resto do projeto. O Asaas fala REAIS —
  // a conversão acontece na borda (`asaas-billing.service`), num lugar só e com
  // teste. Guardar reais aqui e centavos ali é como nasce a cobrança de 100x.
  //
  // `null` = não configurado → a cobrança pelo Asaas responde 503, em vez de
  // inventar um valor. Falhar fechado é a única opção aceitável no dinheiro.
  async getPrecos(): Promise<PrecosAssinatura | null> {
    const valor = await this.ler<PrecosAssinatura>(KEY_PRECOS);
    if (!valor) return null;
    const mensal = this.clampPreco(valor.mensalCentavos);
    const anual = this.clampPreco(valor.anualCentavos);
    if (mensal === null || anual === null) return null;
    return { mensalCentavos: mensal, anualCentavos: anual };
  }

  async setPrecos(
    precos: PrecosAssinatura,
    adminId: string,
  ): Promise<PrecosAssinatura> {
    const mensal = this.clampPreco(precos.mensalCentavos);
    const anual = this.clampPreco(precos.anualCentavos);
    if (mensal === null || anual === null) {
      throw new BadRequestException(
        `Preço fora da faixa permitida (R$ ${PRECO_MIN_CENTAVOS / 100} a R$ ${PRECO_MAX_CENTAVOS / 100}).`,
      );
    }
    const valor: PrecosAssinatura = {
      mensalCentavos: mensal,
      anualCentavos: anual,
    };
    await this.gravar(KEY_PRECOS, valor, adminId);
    return valor;
  }

  // ⚠️ Fora da faixa vira `null` (recusa), NÃO um valor "corrigido" para a
  // borda: diferente do trial, silenciosamente ajustar preço faria o sistema
  // cobrar um número que ninguém digitou.
  private clampPreco(centavos: unknown): number | null {
    if (typeof centavos !== 'number' || !Number.isInteger(centavos))
      return null;
    if (centavos < PRECO_MIN_CENTAVOS || centavos > PRECO_MAX_CENTAVOS) {
      return null;
    }
    return centavos;
  }
}
