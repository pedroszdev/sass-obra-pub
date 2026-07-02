import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  EDITAL_SOURCE_CONNECTORS,
  EditalSourceConnector,
} from '../connectors/edital-source-connector';
import { Edital } from '../edital.entity';
import { IaExtracaoService } from '../exigencias/ia-extracao.service';
import {
  EditalItensExtracao,
  ItensStatus,
} from './edital-itens-extracao.entity';
import { filtrarItensUteis } from './itens-filtro';
import { rankFormato, scorePlanilhaNome } from './planilha-select';
import { PlanilhaTextoService } from './planilha-texto.service';

// Quantos documentos pontuados como planilha baixar por edital (bound de custo).
const MAX_CANDIDATOS_BAIXAR = 8;

// Orquestra a extração da planilha de itens de um edital com CACHE OBRIGATÓRIO
// (§3.4): cache → documentos do conector → seleciona a planilha (score por nome,
// inverso do T-48) → texto (PDF/XLSX) → IA (1x) → persiste. Espelha o
// ExigenciasService (T-49); sucesso/indisponível não reprocessam, só "erro".
@Injectable()
export class ItensExtracaoService {
  private readonly logger = new Logger(ItensExtracaoService.name);
  private readonly inFlight = new Map<string, Promise<EditalItensExtracao>>();

  constructor(
    @InjectRepository(EditalItensExtracao)
    private readonly repo: Repository<EditalItensExtracao>,
    @InjectRepository(Edital)
    private readonly editais: Repository<Edital>,
    @Inject(EDITAL_SOURCE_CONNECTORS)
    private readonly connectors: EditalSourceConnector[],
    private readonly ia: IaExtracaoService,
    private readonly planilhas: PlanilhaTextoService,
  ) {}

  async getOrExtract(editalId: string): Promise<EditalItensExtracao> {
    const cache = await this.repo.findOne({ where: { editalId } });
    if (cache && cache.status !== ItensStatus.ERRO) {
      return cache;
    }
    const emCurso = this.inFlight.get(editalId);
    if (emCurso) return emCurso;

    const tarefa = this.run(editalId, cache).finally(() => {
      this.inFlight.delete(editalId);
    });
    this.inFlight.set(editalId, tarefa);
    return tarefa;
  }

  private async run(
    editalId: string,
    cache: EditalItensExtracao | null,
  ): Promise<EditalItensExtracao> {
    const edital = await this.editais.findOne({ where: { id: editalId } });
    if (!edital) {
      throw new NotFoundException('Edital não encontrado');
    }

    const connector = this.connectors.find((c) => c.fonte === edital.fonte);
    if (!connector) {
      return this.persist(editalId, cache, {
        status: ItensStatus.ERRO,
        erro: `Sem conector para a fonte ${edital.fonte}`,
      });
    }

    let candidatos;
    try {
      candidatos = await connector.fetchEditalDocuments(edital.idExterno);
    } catch (error) {
      return this.persist(editalId, cache, {
        status: ItensStatus.ERRO,
        erro: `Falha ao listar documentos: ${this.msg(error)}`,
      });
    }

    // Pontua os documentos como planilha (inverso do T-48); baixa os melhores.
    const pontuados = candidatos
      .map((c) => ({ ...c, score: scorePlanilhaNome(c.nome) }))
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_CANDIDATOS_BAIXAR);

    const extraidos: {
      nome: string;
      score: number;
      formato: string;
      texto: string;
    }[] = [];
    for (const cand of pontuados) {
      try {
        const r = await this.planilhas.extrairDeUrl(cand.url);
        if (r.texto) {
          extraidos.push({
            nome: cand.nome,
            score: cand.score,
            formato: r.formato,
            texto: r.texto,
          });
        }
      } catch (error) {
        this.logger.warn(
          `Falha ao extrair planilha "${cand.nome}" do edital ${editalId}: ${this.msg(error)}`,
        );
      }
    }

    // Sem planilha extraível (sem anexo, .xls binário, etc.) → indisponível, SEM IA.
    if (extraidos.length === 0) {
      return this.persist(editalId, cache, {
        status: ItensStatus.INDISPONIVEL,
      });
    }

    // Melhor planilha: maior score, desempate por formato (xlsx > pdf).
    extraidos.sort(
      (a, b) =>
        b.score - a.score || rankFormato(b.formato) - rankFormato(a.formato),
    );
    const escolhida = extraidos[0];

    // Uma chamada de IA — extrai os itens da planilha (T-63 validou o acerto).
    let extracao;
    try {
      extracao = await this.ia.extrairItens(escolhida.texto);
    } catch (error) {
      return this.persist(editalId, cache, {
        status: ItensStatus.ERRO,
        erro: `Falha na IA: ${this.msg(error)}`,
      });
    }

    const { temPlanilha, itens } = extracao.resultado;
    // Guarda §3.4: descarta linhas sem descrição útil e zera quantidade/preço ≤ 0
    // (planilha modelo em branco, cabeçalhos, alucinação) antes de confiar.
    const itensUteis = filtrarItensUteis(itens);
    // A IA leu o texto mas não era uma planilha de itens de fato, ou só devolveu
    // linhas sem descrição útil → indisponível (cai no import manual T-65).
    if (!temPlanilha || itensUteis.length === 0) {
      return this.persist(editalId, cache, {
        status: ItensStatus.INDISPONIVEL,
      });
    }

    return this.persist(editalId, cache, {
      status: ItensStatus.EXTRAIDO,
      itens: itensUteis,
      formato: escolhida.formato,
      documentoNome: escolhida.nome,
      modelo: this.ia.modelo,
      promptTokens: extracao.promptTokens,
      completionTokens: extracao.completionTokens,
      custoUsd: extracao.custoUsd,
      erro: null,
    });
  }

  // Upsert do resultado (1:1 com o edital). Reusa a linha de "erro" ou cria.
  private async persist(
    editalId: string,
    cache: EditalItensExtracao | null,
    patch: Partial<EditalItensExtracao>,
  ): Promise<EditalItensExtracao> {
    const base =
      cache ??
      this.repo.create({
        editalId,
        status: ItensStatus.ERRO,
        itens: null,
        formato: null,
        documentoNome: null,
        modelo: null,
        promptTokens: null,
        completionTokens: null,
        custoUsd: null,
        erro: null,
      });
    const limpo: Partial<EditalItensExtracao> =
      patch.status === ItensStatus.EXTRAIDO
        ? patch
        : {
            itens: null,
            formato: null,
            documentoNome: null,
            modelo: null,
            promptTokens: null,
            completionTokens: null,
            custoUsd: null,
            erro: null,
            ...patch,
          };
    return this.repo.save({ ...base, ...limpo, editalId });
  }

  private msg(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
