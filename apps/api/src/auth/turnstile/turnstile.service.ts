import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const SITEVERIFY_ENDPOINT =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';

// Teto curto de propósito (T-203). O cadastro é síncrono: o usuário está olhando
// o botão girar. 3s é folgado para um POST à borda da Cloudflare e curto o
// bastante para que uma indisponibilidade dela não pareça app travado.
const TIMEOUT_MS = 3_000;

// O token do Turnstile é opaco e curto (~600 chars hoje). O teto existe para não
// mandar megabyte de lixo ao siteverify — e o DTO já barra antes (MaxLength).
const TOKEN_MAX = 2048;

export interface SiteverifyResposta {
  success?: boolean;
  action?: string;
  hostname?: string;
  'error-codes'?: string[];
}

export type Veredito =
  | { ok: true }
  | { ok: false; motivo: string; detalhe?: string };

/**
 * A avaliação da resposta do siteverify — pura, e é o que o teste cobre.
 *
 * `success` sozinho NÃO basta, e é o erro clássico de integração de captcha:
 *
 *   - **`action`**: sem conferir, um token emitido no widget de OUTRA tela
 *     (mesmo sitekey, ação diferente) vale no cadastro. Hoje só existe uma
 *     superfície protegida, então a checagem é barata; ela é o que mantém a
 *     segunda (o `forgot-password` que o backlog cogita) isolada da primeira.
 *   - **`hostname`**: o sitekey é PÚBLICO (está no bundle do front). Sem esta
 *     conferência, qualquer um sobe uma página com o nosso sitekey, resolve o
 *     desafio lá e usa o token aqui — o widget viraria enfeite. O `hostname` é
 *     onde o desafio foi de fato resolvido, e quem afirma isso é a Cloudflare.
 */
export function avaliarSiteverify(
  resposta: SiteverifyResposta,
  esperado: { action: string; hostnames: string[] },
): Veredito {
  if (resposta.success !== true) {
    // Os error-codes vão para o LOG, nunca para o cliente (não entregar ao
    // atacante o motivo exato da recusa).
    return {
      ok: false,
      motivo: 'token recusado',
      detalhe: (resposta['error-codes'] ?? []).join(',') || 'sem error-codes',
    };
  }
  if (resposta.action !== esperado.action) {
    return {
      ok: false,
      motivo: 'ação divergente',
      detalhe: `esperava ${esperado.action}, veio ${resposta.action ?? '(vazio)'}`,
    };
  }
  if (!resposta.hostname || !esperado.hostnames.includes(resposta.hostname)) {
    return {
      ok: false,
      motivo: 'hostname não autorizado',
      detalhe: `esperava ${esperado.hostnames.join('|')}, veio ${resposta.hostname ?? '(vazio)'}`,
    };
  }
  return { ok: true };
}

/**
 * Hostnames aceitos, derivados do `WEB_ORIGIN` — de propósito, em vez de uma env
 * nova (`TURNSTILE_HOSTNAMES`).
 *
 * O `WEB_ORIGIN` já é a origem do front, já é OBRIGATÓRIA em produção
 * (`env.validation.ts`) e já é a única coisa que o CORS aceita. Uma env separada
 * seria uma segunda fonte da verdade para o mesmo fato — e o `render.yaml` já
 * mostrou (T-163) que o que este projeto erra é env esquecida, não env de menos.
 * De brinde, isso satisfaz sozinho a regra "produção não deve aceitar
 * localhost": em prod o `WEB_ORIGIN` é o domínio real, e em dev é o Vite.
 */
export function hostnamesDe(webOrigin: string): string[] {
  try {
    return [new URL(webOrigin).hostname];
  } catch {
    // WEB_ORIGIN malformado: não há hostname aceitável, então nada passa. É a
    // degradação certa — o alternativo seria aceitar qualquer hostname.
    return [];
  }
}

/**
 * Verificação do Turnstile no cadastro (T-203).
 *
 * O trial é de 7 dias SEM cartão (T-127), o que faz do `/cadastro` um alvo
 * barato: cada conta falsa queima cota do Resend (3.000/mês), pode disparar IA
 * paga e polui MRR e conversão do /admin (T-194) — justo as métricas do beta.
 *
 * ── Degradação (decisão do dono, 29/07) ──
 *
 * `TURNSTILE_SECRET_KEY` **ausente** → verificação DESLIGADA e o cadastro passa
 * sem proteção. É a mesma degradação da IA, do Google, do e-mail e da Stripe
 * (§8): nenhuma integração opcional derruba o boot, e dev/teste seguem sem
 * configurar nada. ⚠️ O risco fica concentrado num ponto: **esquecer a env em
 * produção deixa o cadastro desprotegido em silêncio** — por isso o boot loga
 * um aviso, e por isso a env está declarada no `render.yaml`.
 *
 * `TURNSTILE_SECRET_KEY` **presente** → fail-CLOSED: token ausente, inválido,
 * reusado, ou Cloudflare fora do ar/lenta, tudo isso RECUSA o cadastro. O
 * cadastro não é fluxo de usuário existente (ninguém fica sem acesso ao que já
 * tem), então errar para o lado de barrar é o barato aqui.
 */
@Injectable()
export class TurnstileService {
  private readonly logger = new Logger(TurnstileService.name);
  private avisouDesligado = false;

  constructor(private readonly config: ConfigService) {}

  /** Sem segredo, a verificação não acontece — ver a degradação acima. */
  get habilitado(): boolean {
    return this.secret !== undefined;
  }

  private get secret(): string | undefined {
    return this.config.get<string>('TURNSTILE_SECRET_KEY')?.trim() || undefined;
  }

  private get hostnames(): string[] {
    return hostnamesDe(
      this.config.get<string>('WEB_ORIGIN', 'http://localhost:5173'),
    );
  }

  /**
   * Devolve `true` se pode prosseguir. NÃO lança: quem traduz a recusa em HTTP é
   * o guard (mensagem genérica, sem dizer o que falhou).
   */
  async verificar(params: {
    token: unknown;
    action: string;
    ip: string | null;
  }): Promise<boolean> {
    const secret = this.secret;
    if (!secret) {
      if (!this.avisouDesligado) {
        this.logger.warn(
          'TURNSTILE_SECRET_KEY ausente — cadastro SEM proteção contra bot (T-203).',
        );
        this.avisouDesligado = true;
      }
      return true;
    }

    const { token, action, ip } = params;
    if (typeof token !== 'string' || !token || token.length > TOKEN_MAX) {
      this.logger.warn(`Turnstile: token ausente ou inválido em "${action}".`);
      return false;
    }

    const hostnames = this.hostnames;
    if (hostnames.length === 0) {
      // WEB_ORIGIN malformado é erro de operação, não tentativa de abuso — mas
      // não há como validar o hostname sem ele, e fail-open aqui anularia a
      // proteção inteira em silêncio.
      this.logger.error(
        'Turnstile: WEB_ORIGIN inválido — não há hostname para validar; recusando.',
      );
      return false;
    }

    let resposta: SiteverifyResposta;
    try {
      const r = await fetch(SITEVERIFY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          secret,
          response: token,
          // O IP vai pela MESMA função que o rate limit e a auditoria usam
          // (T-204): mandar aqui um `req.ips[0]` forjado seria alimentar a
          // Cloudflare com mentira e piorar a análise dela.
          ...(ip ? { remoteip: ip } : {}),
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!r.ok) throw new Error(`siteverify respondeu ${r.status}`);
      resposta = (await r.json()) as SiteverifyResposta;
    } catch (erro) {
      // Fail-closed (decisão do dono): rede, timeout, 5xx ou corpo não-JSON
      // barram o cadastro. Vai para o log porque "cadastro parou de funcionar"
      // precisa de causa visível — o cliente só vê a mensagem genérica.
      this.logger.error(
        `Turnstile: falha ao verificar (recusando o cadastro): ${this.msg(erro)}`,
      );
      return false;
    }

    const veredito = avaliarSiteverify(resposta, { action, hostnames });
    if (!veredito.ok) {
      this.logger.warn(
        `Turnstile: ${veredito.motivo} em "${action}" (${veredito.detalhe ?? '-'}).`,
      );
      return false;
    }
    return true;
  }

  private msg(erro: unknown): string {
    return erro instanceof Error ? erro.message : String(erro);
  }
}
