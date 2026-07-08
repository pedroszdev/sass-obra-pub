import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  EDITAL_SOURCE_CONNECTORS,
  EditalSourceConnector,
} from '../connectors/edital-source-connector';
import { Edital } from '../edital.entity';
import { SITUACOES_INATIVAS } from '../situacao';
import { DocumentoTextoService } from './documento-texto.service';
import { EditalExigencias, ExigenciasStatus } from './edital-exigencias.entity';
import {
  temSinalHabilitacao,
  verificarTrechos,
} from './exigencias-verificacao';
import { IaCustoService } from '../ia-custo.service';
import { IaExtracaoService } from './ia-extracao.service';

// Orquestra a extração de exigências de um edital com CACHE OBRIGATÓRIO (§3.4):
//   cache → documentos do conector → texto → IA (1x) → verificação → persiste.
// A pré-filtragem por sinal de habilitação (local, grátis) resolve a seleção do
// documento (achado T-48) e garante no máximo 1 chamada de IA por edital.
@Injectable()
export class ExigenciasService {
  private readonly logger = new Logger(ExigenciasService.name);
  // Dedup de concorrência: 2 acessos simultâneos ao mesmo edital não disparam
  // 2 extrações (e 2 chamadas de IA).
  private readonly inFlight = new Map<string, Promise<EditalExigencias>>();
  // UFs com pré-computação em andamento — dedup do disparo.
  private readonly precomputingUfs = new Set<string>();

  constructor(
    @InjectRepository(EditalExigencias)
    private readonly repo: Repository<EditalExigencias>,
    @InjectRepository(Edital)
    private readonly editais: Repository<Edital>,
    @Inject(EDITAL_SOURCE_CONNECTORS)
    private readonly connectors: EditalSourceConnector[],
    private readonly ia: IaExtracaoService,
    private readonly documentos: DocumentoTextoService,
    private readonly config: ConfigService,
    private readonly iaCusto: IaCustoService,
  ) {}

  // Pré-computação em background: analisa os top-N editais de obra de uma UF
  // ainda NÃO analisados (mais recentes primeiro), antecipando resumo +
  // exigências (e o filtro "apto") antes do clique. Hoje disparada pela captação
  // (os novos já vêm com resumo) — gatilho na busca fica para depois (BACKLOG
  // T-55). Fire-and-forget; dedup por UF; só os não-analisados (sem retrabalho);
  // sequencial. Retorna true se há rodada ativa para a UF.
  //
  // LIGADA por padrão. A captação dispara isso (cron/manual/sob demanda T-34),
  // então custa IA quando a captação roda. Kill-switch de custo:
  // PRECOMPUTE_ENABLED=false desliga (ex.: cortar gasto sem alterar código).
  async triggerPrecomputeUf(uf: string): Promise<boolean> {
    if (!this.precomputeHabilitado()) return false;
    // Teto de custo de IA (T-133): não abre uma rodada de pré-computação em massa
    // se o orçamento do período já estourou.
    if (!(await this.iaCusto.dentroDoOrcamento())) {
      this.logger.warn(
        `Pré-computação em ${uf} pulada: orçamento de IA atingido.`,
      );
      return false;
    }
    if (this.precomputingUfs.has(uf)) return true;
    const ids = await this.findNaoAnalisados(uf);
    if (ids.length === 0) return false;
    this.precomputingUfs.add(uf);
    this.logger.log(`Pré-computação de ${ids.length} edital(is) em ${uf}.`);
    void this.precomputar(ids).finally(() => this.precomputingUfs.delete(uf));
    return true;
  }

  private precomputeHabilitado(): boolean {
    return this.config.get('PRECOMPUTE_ENABLED', 'true') !== 'false';
  }

  // IDs dos top-N editais de obra da UF sem exigências (LEFT JOIN ... IS NULL),
  // mais recentes primeiro. `limit` configurável (PRECOMPUTE_LIMIT, default 20).
  protected async findNaoAnalisados(uf: string): Promise<string[]> {
    const limit = Number(this.config.get('PRECOMPUTE_LIMIT', 20));
    const rows = await this.editais
      .createQueryBuilder('e')
      .leftJoin(EditalExigencias, 'x', 'x.edital_id = e.id')
      .where('e.is_obra = true')
      .andWhere('e.uf = :uf', { uf })
      .andWhere('x.id IS NULL')
      // Não gasta IA em edital já encerrado por data (T-114): sem prazo (null =
      // desconhecido) ou prazo ainda por vir.
      .andWhere('(e.prazo_proposta IS NULL OR e.prazo_proposta >= :agora)', {
        agora: new Date(),
      })
      // Nem em edital morto por situação (T-114): anulado/revogado/suspenso.
      .andWhere(
        '(e.situacao IS NULL OR e.situacao NOT IN (:...situacoesInativas))',
        { situacoesInativas: [...SITUACOES_INATIVAS] },
      )
      .orderBy('e.data_publicacao', 'DESC')
      .limit(limit)
      .select('e.id', 'id')
      .getRawMany<{ id: string }>();
    return rows.map((r) => r.id);
  }

  // Extrai sequencialmente (gentil com OpenAI/PNCP). Erro de um edital não
  // derruba os outros — getOrExtract já trata e persiste o status.
  private async precomputar(ids: string[]): Promise<void> {
    for (const id of ids) {
      try {
        await this.getOrExtract(id);
      } catch (error) {
        this.logger.warn(
          `Pré-computação falhou no edital ${id}: ${this.msg(error)}`,
        );
      }
    }
  }

  async getOrExtract(editalId: string): Promise<EditalExigencias> {
    const cache = await this.repo.findOne({ where: { editalId } });
    // Sucesso/indisponível não reprocessam (§3.4); só "erro" re-tenta.
    if (cache && cache.status !== ExigenciasStatus.ERRO) {
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
    cache: EditalExigencias | null,
  ): Promise<EditalExigencias> {
    const edital = await this.editais.findOne({ where: { id: editalId } });
    if (!edital) {
      throw new NotFoundException('Edital não encontrado');
    }

    const connector = this.connectors.find((c) => c.fonte === edital.fonte);
    if (!connector) {
      return this.persist(editalId, cache, {
        status: ExigenciasStatus.ERRO,
        erro: `Sem conector para a fonte ${edital.fonte}`,
      });
    }

    // 1) Candidatos ranqueados (edital principal primeiro).
    let candidatos;
    try {
      candidatos = await connector.fetchEditalDocuments(edital.idExterno);
    } catch (error) {
      return this.persist(editalId, cache, {
        status: ExigenciasStatus.ERRO,
        erro: `Falha ao listar documentos: ${this.msg(error)}`,
      });
    }

    // 2) Escolhe o 1º documento com texto que tem sinal de habilitação (grátis).
    let texto: string | null = null;
    let documentoNome: string | null = null;
    for (const candidato of candidatos) {
      let extraido: string | null;
      try {
        extraido = await this.documentos.extrairDeUrl(candidato.url);
      } catch (error) {
        this.logger.warn(
          `Falha ao extrair "${candidato.nome}" do edital ${editalId}: ${this.msg(error)}`,
        );
        continue;
      }
      if (extraido && temSinalHabilitacao(extraido)) {
        texto = extraido;
        documentoNome = candidato.nome;
        break;
      }
    }

    // 3) Sem edital completo (só resumo / sem PDF útil) — indisponível, SEM IA.
    if (!texto) {
      return this.persist(editalId, cache, {
        status: ExigenciasStatus.INDISPONIVEL,
        erro: null,
      });
    }

    // 4) Uma chamada de IA — devolve exigências (T-49) + resumo (T-50). Antes,
    // o teto de custo (T-133): 503 se o orçamento do período estourou (o cache e
    // o "indisponível" acima não gastam IA, então não são afetados).
    await this.iaCusto.assertDentroDoOrcamento();
    let extracao;
    try {
      extracao = await this.ia.extrair(texto);
    } catch (error) {
      return this.persist(editalId, cache, {
        status: ExigenciasStatus.ERRO,
        erro: `Falha na IA: ${this.msg(error)}`,
      });
    }
    const { resumo, ...exigencias } = extracao.resultado;

    // 5) Quality gate anti-alucinação (sobre as exigências) + persiste o uso.
    const { ok, total } = verificarTrechos(exigencias, texto);
    return this.persist(editalId, cache, {
      status: ExigenciasStatus.EXTRAIDO,
      exigencias,
      resumo,
      modelo: this.ia.modelo,
      documentoNome,
      trechosOk: ok,
      trechosTotal: total,
      promptTokens: extracao.promptTokens,
      completionTokens: extracao.completionTokens,
      custoUsd: extracao.custoUsd,
      erro: null,
    });
  }

  // Upsert do resultado (1:1 com o edital). Reusa a linha existente (re-tentativa
  // de "erro") ou cria.
  private async persist(
    editalId: string,
    cache: EditalExigencias | null,
    patch: Partial<EditalExigencias>,
  ): Promise<EditalExigencias> {
    const base =
      cache ??
      this.repo.create({
        editalId,
        status: ExigenciasStatus.ERRO,
        exigencias: null,
        resumo: null,
        modelo: null,
        documentoNome: null,
        trechosOk: null,
        trechosTotal: null,
        promptTokens: null,
        completionTokens: null,
        custoUsd: null,
        erro: null,
      });
    // Limpa campos de resultado quando não for "extraido".
    const limpo: Partial<EditalExigencias> =
      patch.status === ExigenciasStatus.EXTRAIDO
        ? patch
        : {
            exigencias: null,
            resumo: null,
            modelo: null,
            documentoNome: null,
            trechosOk: null,
            trechosTotal: null,
            promptTokens: null,
            completionTokens: null,
            custoUsd: null,
            ...patch,
          };
    return this.repo.save({ ...base, ...limpo, editalId });
  }

  private msg(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
