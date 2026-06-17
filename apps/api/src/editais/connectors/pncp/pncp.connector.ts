import { Injectable, Logger } from '@nestjs/common';
import { EditalFonte } from '../../edital-fonte.enum';
import { EditalQuery } from '../edital-query';
import { EditalSourceConnector } from '../edital-source-connector';
import { EditalSourceRecord } from '../edital-source-record';
import {
  PNCP_BASE_BACKOFF_MS,
  PNCP_BASE_URL,
  PNCP_MAX_ATTEMPTS,
  PNCP_MAX_BACKOFF_MS,
  PNCP_MODALIDADES,
  PNCP_PAGE_DELAY_MS,
  PNCP_PAGE_SIZE,
  PNCP_TIMEOUT_MS,
} from './pncp.constants';
import { mapPncpRecord } from './pncp.mapper';
import { PncpResponse } from './pncp.types';

function formatPncpDate(date: Date): string {
  const ano = date.getFullYear();
  const mes = String(date.getMonth() + 1).padStart(2, '0');
  const dia = String(date.getDate()).padStart(2, '0');
  return `${ano}${mes}${dia}`; // yyyyMMdd — formato exigido pelo PNCP
}

// Conector do PNCP (fonte primária). Dado um período numa UF, busca as
// Concorrências paginando a API e emite cada edital no formato padronizado.
// Paginação + retry robusto (429/5xx/rede) com backoff — não perde editais
// nem martela a API.
@Injectable()
export class PncpConnector implements EditalSourceConnector {
  readonly fonte = EditalFonte.PNCP;
  private readonly logger = new Logger(PncpConnector.name);

  async *fetchEditais(query: EditalQuery): AsyncIterable<EditalSourceRecord> {
    for (const modalidade of PNCP_MODALIDADES) {
      yield* this.fetchModalidade(query, modalidade);
    }
  }

  private async *fetchModalidade(
    query: EditalQuery,
    modalidade: number,
  ): AsyncIterable<EditalSourceRecord> {
    let pagina = 1;
    while (true) {
      const resposta = await this.fetchPage(query, modalidade, pagina);
      for (const registro of resposta.data ?? []) {
        yield mapPncpRecord(registro);
      }
      if (pagina >= (resposta.totalPaginas ?? 0)) {
        break;
      }
      await this.pause(PNCP_PAGE_DELAY_MS);
      pagina++;
    }
  }

  // Busca uma página com retry robusto:
  //  - 429 → re-tenta honrando Retry-After (senão backoff exponencial);
  //  - 5xx / timeout / erro de rede → re-tenta com backoff;
  //  - 4xx (exceto 429) → falha de imediato (erro do cliente).
  private async fetchPage(
    query: EditalQuery,
    modalidade: number,
    pagina: number,
  ): Promise<PncpResponse> {
    const url = this.buildUrl(query, modalidade, pagina);

    for (let tentativa = 1; ; tentativa++) {
      let resp: Response;
      try {
        resp = await fetch(url, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(PNCP_TIMEOUT_MS),
        });
      } catch (error) {
        if (tentativa >= PNCP_MAX_ATTEMPTS) {
          throw new Error(
            `PNCP: falha de rede após ${tentativa} tentativas (página ${pagina}, modalidade ${modalidade})`,
            { cause: error },
          );
        }
        await this.waitBeforeRetry(
          this.backoff(tentativa),
          'rede',
          pagina,
          modalidade,
          tentativa,
        );
        continue;
      }

      if (resp.status === 204) {
        return this.emptyResponse(pagina);
      }
      if (resp.status === 429 || resp.status >= 500) {
        if (tentativa >= PNCP_MAX_ATTEMPTS) {
          throw new Error(
            `PNCP HTTP ${resp.status} persistente após ${tentativa} tentativas (página ${pagina}, modalidade ${modalidade})`,
          );
        }
        await this.waitBeforeRetry(
          this.retryDelay(resp, tentativa),
          `HTTP ${resp.status}`,
          pagina,
          modalidade,
          tentativa,
        );
        continue;
      }
      if (!resp.ok) {
        const texto = await resp.text();
        throw new Error(
          `PNCP HTTP ${resp.status} em ${url}: ${texto.slice(0, 200)}`,
        );
      }
      return (await resp.json()) as PncpResponse;
    }
  }

  private buildUrl(
    query: EditalQuery,
    modalidade: number,
    pagina: number,
  ): string {
    const params = new URLSearchParams({
      dataInicial: formatPncpDate(query.dataInicial),
      dataFinal: formatPncpDate(query.dataFinal),
      codigoModalidadeContratacao: String(modalidade),
      uf: query.uf,
      pagina: String(pagina),
      tamanhoPagina: String(PNCP_PAGE_SIZE),
    });
    return `${PNCP_BASE_URL}?${params.toString()}`;
  }

  private emptyResponse(pagina: number): PncpResponse {
    return {
      data: [],
      totalRegistros: 0,
      totalPaginas: 0,
      numeroPagina: pagina,
      paginasRestantes: 0,
      empty: true,
    };
  }

  // Quanto esperar antes de re-tentar: honra Retry-After (segundos) quando o
  // servidor manda; senão usa o backoff exponencial.
  private retryDelay(resp: Response, tentativa: number): number {
    const retryAfter = resp.headers.get('retry-after');
    if (retryAfter !== null) {
      const segundos = Number(retryAfter);
      if (Number.isFinite(segundos) && segundos >= 0) {
        return segundos * 1000;
      }
    }
    return this.backoff(tentativa);
  }

  // Backoff exponencial com teto e jitter (±20%) — evita martelar a API.
  private backoff(tentativa: number): number {
    const exponencial = PNCP_BASE_BACKOFF_MS * 2 ** (tentativa - 1);
    const limitado = Math.min(exponencial, PNCP_MAX_BACKOFF_MS);
    const jitter = limitado * 0.2 * Math.random();
    return Math.round(limitado + jitter);
  }

  private async waitBeforeRetry(
    ms: number,
    motivo: string,
    pagina: number,
    modalidade: number,
    tentativa: number,
  ): Promise<void> {
    this.logger.warn(
      `${motivo} na página ${pagina} (modalidade ${modalidade}); aguardando ${ms}ms (${tentativa}/${PNCP_MAX_ATTEMPTS})`,
    );
    await this.pause(ms);
  }

  // Pausa isolada num método para os testes poderem pular as esperas.
  protected pause(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
