import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { EditalSourceConnector } from '../src/editais/connectors/edital-source-connector';
import { Edital } from '../src/editais/edital.entity';
import { DocumentoTextoService } from '../src/editais/exigencias/documento-texto.service';
import {
  EditalExigencias,
  ExigenciasStatus,
} from '../src/editais/exigencias/edital-exigencias.entity';
import { ExigenciasService } from '../src/editais/exigencias/exigencias.service';
import { IaExtracaoService } from '../src/editais/exigencias/ia-extracao.service';
import {
  ExigenciasHabilitacao,
  ExtracaoIa,
  ResumoEdital,
} from '../src/editais/exigencias/exigencias.types';
import { EditalFonte } from '../src/editais/edital-fonte.enum';

function fakeRepo() {
  return {
    findOne: jest.fn(),
    create: jest.fn((x: Record<string, unknown>) => ({ ...x })),
    save: jest.fn((x: Record<string, unknown>) =>
      Promise.resolve({ id: x.id ?? 'gen-id', ...x }),
    ),
  };
}

// Texto longo com sinais de habilitação (passa em temSinalHabilitacao).
const textoEdital = (
  'Da habilitação: o licitante deve apresentar prova de regularidade fiscal ' +
  'com a Fazenda Federal, FGTS e certidao negativa. CNPJ ativo. '
).padEnd(2000, ' .');

// Texto longo SEM sinais (ex.: projeto executivo — IA devolveria vazio).
const textoProjeto = 'Memorial descritivo de pavimentacao. '.padEnd(2000, ' x');

const exigenciasOk: ExigenciasHabilitacao = {
  resumoObjeto: 'Pavimentação',
  certidoes: [],
  registroConselho: { exigido: false, conselho: null, trecho: null },
  capacidadeTecnica: { exigida: false, descricao: null, trecho: null },
  capitalSocial: {
    exigido: false,
    valorMinimoReais: null,
    percentualSobreEstimado: null,
    trecho: null,
  },
  garantia: { exigida: false, trecho: null },
  outrosRequisitos: [],
};

const resumoOk: ResumoEdital = {
  visaoGeral: 'Pavimentação de via urbana.',
  prazoExecucao: '180 dias',
  datasChave: [{ evento: 'Sessão de abertura', quando: '12/07/2026' }],
  pontosDeAtencao: ['Visita técnica facultativa'],
};

const extracaoOk: ExtracaoIa = { ...exigenciasOk, resumo: resumoOk };

describe('ExigenciasService', () => {
  let repo: ReturnType<typeof fakeRepo>;
  let editais: ReturnType<typeof fakeRepo>;
  let connector: { fonte: EditalFonte; fetchEditalDocuments: jest.Mock };
  let ia: { extrair: jest.Mock; modelo: string };
  let documentos: { extrairDeUrl: jest.Mock };
  let service: ExigenciasService;

  const edital = { id: 'e1', fonte: EditalFonte.PNCP, idExterno: 'x-1-1/2026' };

  beforeEach(() => {
    repo = fakeRepo();
    editais = fakeRepo();
    connector = {
      fonte: EditalFonte.PNCP,
      fetchEditalDocuments: jest
        .fn()
        .mockResolvedValue([{ nome: 'EDITAL.pdf', url: 'u' }]),
    };
    ia = {
      extrair: jest.fn().mockResolvedValue(extracaoOk),
      modelo: 'gpt-5.4-mini',
    };
    documentos = { extrairDeUrl: jest.fn() };
    service = new ExigenciasService(
      repo as unknown as Repository<EditalExigencias>,
      editais as unknown as Repository<Edital>,
      [connector as unknown as EditalSourceConnector],
      ia as unknown as IaExtracaoService,
      documentos as unknown as DocumentoTextoService,
    );
  });

  it('cache hit (extraido) não reprocessa', async () => {
    const cache = { editalId: 'e1', status: ExigenciasStatus.EXTRAIDO };
    repo.findOne.mockResolvedValue(cache);

    const out = await service.getOrExtract('e1');

    expect(out).toBe(cache);
    expect(connector.fetchEditalDocuments).not.toHaveBeenCalled();
    expect(ia.extrair).not.toHaveBeenCalled();
  });

  it('edital inexistente → 404', async () => {
    repo.findOne.mockResolvedValue(null);
    editais.findOne.mockResolvedValue(null);

    await expect(service.getOrExtract('e1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('sem sinal de habilitação → indisponível, SEM chamar a IA', async () => {
    repo.findOne.mockResolvedValue(null);
    editais.findOne.mockResolvedValue(edital);
    documentos.extrairDeUrl.mockResolvedValue(textoProjeto);

    const out = await service.getOrExtract('e1');

    expect(ia.extrair).not.toHaveBeenCalled();
    expect(out.status).toBe(ExigenciasStatus.INDISPONIVEL);
  });

  it('com sinal → chama a IA 1x e persiste extraido', async () => {
    repo.findOne.mockResolvedValue(null);
    editais.findOne.mockResolvedValue(edital);
    documentos.extrairDeUrl.mockResolvedValue(textoEdital);

    const out = await service.getOrExtract('e1');

    expect(ia.extrair).toHaveBeenCalledTimes(1);
    expect(out.status).toBe(ExigenciasStatus.EXTRAIDO);
    expect(out.exigencias).toEqual(exigenciasOk);
    expect(out.resumo).toEqual(resumoOk);
    expect(out.modelo).toBe('gpt-5.4-mini');
    expect(out.documentoNome).toBe('EDITAL.pdf');
  });

  it('IA falha → status erro (re-tentável)', async () => {
    repo.findOne.mockResolvedValue(null);
    editais.findOne.mockResolvedValue(edital);
    documentos.extrairDeUrl.mockResolvedValue(textoEdital);
    ia.extrair.mockRejectedValue(new Error('429'));

    const out = await service.getOrExtract('e1');

    expect(out.status).toBe(ExigenciasStatus.ERRO);
    expect(out.exigencias).toBeNull();
  });

  it('dedup: acessos concorrentes disparam só 1 extração', async () => {
    repo.findOne.mockResolvedValue(null);
    editais.findOne.mockResolvedValue(edital);
    documentos.extrairDeUrl.mockResolvedValue(textoEdital);

    await Promise.all([service.getOrExtract('e1'), service.getOrExtract('e1')]);

    expect(ia.extrair).toHaveBeenCalledTimes(1);
  });
});
