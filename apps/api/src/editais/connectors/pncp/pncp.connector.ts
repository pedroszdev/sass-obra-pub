import { Injectable, Logger } from '@nestjs/common';
import { EditalFonte } from '../../edital-fonte.enum';
import { EditalQuery } from '../edital-query';
import { EditalSourceConnector } from '../edital-source-connector';
import { EditalSourceRecord } from '../edital-source-record';
import {
  PNCP_BACKOFF_MS,
  PNCP_BASE_URL,
  PNCP_MAX_RETRIES_429,
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
// Paginação básica + retry no 429 aqui; o endurecimento é a T-13.
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

  // Busca uma página, re-tentando com backoff quando bate no rate limit (429).
  private async fetchPage(
    query: EditalQuery,
    modalidade: number,
    pagina: number,
  ): Promise<PncpResponse> {
    const params = new URLSearchParams({
      dataInicial: formatPncpDate(query.dataInicial),
      dataFinal: formatPncpDate(query.dataFinal),
      codigoModalidadeContratacao: String(modalidade),
      uf: query.uf,
      pagina: String(pagina),
      tamanhoPagina: String(PNCP_PAGE_SIZE),
    });
    const url = `${PNCP_BASE_URL}?${params.toString()}`;

    for (let tentativa = 1; tentativa <= PNCP_MAX_RETRIES_429; tentativa++) {
      const resp = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(PNCP_TIMEOUT_MS),
      });

      if (resp.status === 204) {
        return {
          data: [],
          totalRegistros: 0,
          totalPaginas: 0,
          numeroPagina: pagina,
          paginasRestantes: 0,
          empty: true,
        };
      }
      if (resp.status === 429) {
        const espera = PNCP_BACKOFF_MS * tentativa;
        this.logger.warn(
          `429 na página ${pagina} (modalidade ${modalidade}); aguardando ${espera}ms (${tentativa}/${PNCP_MAX_RETRIES_429})`,
        );
        await this.pause(espera);
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

    throw new Error(
      `PNCP: rate limit persistente após ${PNCP_MAX_RETRIES_429} tentativas (página ${pagina}, modalidade ${modalidade})`,
    );
  }

  // Pausa isolada num método para os testes poderem pular as esperas.
  protected pause(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
