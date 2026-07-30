// Cliente HTTP do Asaas (T-212, Épico 17). **Sem SDK** — mesmo caminho do
// Resend (§8): `fetch` nativo, zero dependência nova (§4.2).
//
// Fino de propósito: só resolve autenticação, timeout e tradução de erro. Regra
// de negócio fica no service, para continuar testável sem rede.

/** Erro devolvido pelo Asaas, já legível. */
export class AsaasError extends Error {
  constructor(
    readonly status: number,
    /** Códigos do Asaas (ex.: `invalid_object`) — úteis em log e em teste. */
    readonly codigos: string[],
    mensagem: string,
  ) {
    super(mensagem);
    this.name = 'AsaasError';
  }
}

interface RespostaErro {
  errors?: { code?: string; description?: string }[];
}

// 10s, como o cliente da Stripe. ⚠️ Não confundir com o teto de 100s da borda
// Cloudflare (§8): este é o nosso limite para NÃO ficar pendurado num provedor
// lento, e precisa ser bem menor que o dela.
const TIMEOUT_MS = 10_000;

export class AsaasClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    /** Identifica a aplicação — OBRIGATÓRIO em contas criadas após 13/06/2024. */
    private readonly userAgent = 'PrumoLicita',
  ) {}

  get<T>(caminho: string): Promise<T> {
    return this.request<T>('GET', caminho);
  }

  post<T>(caminho: string, corpo: unknown): Promise<T> {
    return this.request<T>('POST', caminho, corpo);
  }

  private async request<T>(
    metodo: 'GET' | 'POST',
    caminho: string,
    corpo?: unknown,
  ): Promise<T> {
    const resp = await fetch(`${this.baseUrl}${caminho}`, {
      method: metodo,
      headers: {
        // ⚠️ `access_token`, sem `Bearer` — não é o padrão OAuth (medido T-209).
        access_token: this.apiKey,
        'Content-Type': 'application/json',
        'User-Agent': this.userAgent,
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const json: unknown = await resp.json().catch(() => null);

    if (!resp.ok) {
      const erros = (json as RespostaErro | null)?.errors ?? [];
      const codigos = erros
        .map((e) => e.code)
        .filter((c): c is string => typeof c === 'string');
      const descricao =
        erros
          .map((e) => e.description)
          .filter(Boolean)
          .join(' | ') || `HTTP ${resp.status}`;
      throw new AsaasError(resp.status, codigos, descricao);
    }

    return json as T;
  }
}
