import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  EDITAL_SOURCE_CONNECTORS,
  EditalSourceConnector,
} from '../connectors/edital-source-connector';
import { Edital } from '../edital.entity';
import { DocumentoTextoService } from './documento-texto.service';
import { EditalExigencias, ExigenciasStatus } from './edital-exigencias.entity';
import {
  temSinalHabilitacao,
  verificarTrechos,
} from './exigencias-verificacao';
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

  constructor(
    @InjectRepository(EditalExigencias)
    private readonly repo: Repository<EditalExigencias>,
    @InjectRepository(Edital)
    private readonly editais: Repository<Edital>,
    @Inject(EDITAL_SOURCE_CONNECTORS)
    private readonly connectors: EditalSourceConnector[],
    private readonly ia: IaExtracaoService,
    private readonly documentos: DocumentoTextoService,
  ) {}

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

    // 4) Uma chamada de IA.
    let exigencias;
    try {
      exigencias = await this.ia.extrair(texto);
    } catch (error) {
      return this.persist(editalId, cache, {
        status: ExigenciasStatus.ERRO,
        erro: `Falha na IA: ${this.msg(error)}`,
      });
    }

    // 5) Quality gate anti-alucinação + persiste.
    const { ok, total } = verificarTrechos(exigencias, texto);
    return this.persist(editalId, cache, {
      status: ExigenciasStatus.EXTRAIDO,
      exigencias,
      modelo: this.ia.modelo,
      documentoNome,
      trechosOk: ok,
      trechosTotal: total,
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
        modelo: null,
        documentoNome: null,
        trechosOk: null,
        trechosTotal: null,
        erro: null,
      });
    // Limpa campos de resultado quando não for "extraido".
    const limpo: Partial<EditalExigencias> =
      patch.status === ExigenciasStatus.EXTRAIDO
        ? patch
        : {
            exigencias: null,
            modelo: null,
            documentoNome: null,
            trechosOk: null,
            trechosTotal: null,
            ...patch,
          };
    return this.repo.save({ ...base, ...limpo, editalId });
  }

  private msg(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
