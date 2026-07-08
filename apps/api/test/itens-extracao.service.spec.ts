import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { EditalSourceConnector } from '../src/editais/connectors/edital-source-connector';
import { Edital } from '../src/editais/edital.entity';
import { IaCustoService } from '../src/editais/ia-custo.service';
import { IaExtracaoService } from '../src/editais/exigencias/ia-extracao.service';
import {
  EditalItensExtracao,
  ItensStatus,
} from '../src/editais/itens/edital-itens-extracao.entity';
import { ItensExtracaoService } from '../src/editais/itens/itens-extracao.service';
import { PlanilhaTextoService } from '../src/editais/itens/planilha-texto.service';
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

const extracaoItensOk = {
  resultado: {
    temPlanilha: true,
    itens: [
      {
        descricao: 'Escavação manual',
        unidade: 'm3',
        quantidade: 10,
        precoReferencia: 50,
      },
    ],
  },
  promptTokens: 2000,
  completionTokens: 800,
  custoUsd: 0.005,
};

describe('ItensExtracaoService (T-64)', () => {
  let repo: ReturnType<typeof fakeRepo>;
  let editais: ReturnType<typeof fakeRepo>;
  let connector: { fonte: EditalFonte; fetchEditalDocuments: jest.Mock };
  let ia: { extrairItens: jest.Mock; modelo: string };
  let planilhas: { extrairDeUrl: jest.Mock };
  let service: ItensExtracaoService;

  const edital = { id: 'e1', fonte: EditalFonte.PNCP, idExterno: 'x-1-1/2026' };

  beforeEach(() => {
    repo = fakeRepo();
    editais = fakeRepo();
    connector = {
      fonte: EditalFonte.PNCP,
      fetchEditalDocuments: jest
        .fn()
        .mockResolvedValue([{ nome: 'Planilha Orçamentária.xlsx', url: 'u' }]),
    };
    ia = {
      extrairItens: jest.fn().mockResolvedValue(extracaoItensOk),
      modelo: 'gpt-5.4-mini',
    };
    planilhas = {
      extrairDeUrl: jest
        .fn()
        .mockResolvedValue({ formato: 'xlsx', texto: 'Item\tqtd\tpreço' }),
    };
    service = new ItensExtracaoService(
      repo as unknown as Repository<EditalItensExtracao>,
      editais as unknown as Repository<Edital>,
      [connector as unknown as EditalSourceConnector],
      ia as unknown as IaExtracaoService,
      planilhas as unknown as PlanilhaTextoService,
      {
        assertDentroDoOrcamento: jest.fn().mockResolvedValue(undefined),
      } as unknown as IaCustoService,
    );
  });

  it('cache hit (extraido) não reprocessa nem chama IA', async () => {
    const cache = { editalId: 'e1', status: ItensStatus.EXTRAIDO };
    repo.findOne.mockResolvedValue(cache);

    const out = await service.getOrExtract('e1');

    expect(out).toBe(cache);
    expect(connector.fetchEditalDocuments).not.toHaveBeenCalled();
    expect(ia.extrairItens).not.toHaveBeenCalled();
  });

  it('edital inexistente → 404', async () => {
    repo.findOne.mockResolvedValue(null);
    editais.findOne.mockResolvedValue(null);
    await expect(service.getOrExtract('e1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('sem planilha extraível → indisponível, SEM chamar a IA', async () => {
    repo.findOne.mockResolvedValue(null);
    editais.findOne.mockResolvedValue(edital);
    planilhas.extrairDeUrl.mockResolvedValue({
      formato: 'nenhum',
      texto: null,
    });

    const out = await service.getOrExtract('e1');

    expect(ia.extrairItens).not.toHaveBeenCalled();
    expect(out.status).toBe(ItensStatus.INDISPONIVEL);
  });

  it('com planilha → chama a IA 1x e persiste extraido com os itens úteis', async () => {
    repo.findOne.mockResolvedValue(null);
    editais.findOne.mockResolvedValue(edital);

    const out = await service.getOrExtract('e1');

    expect(ia.extrairItens).toHaveBeenCalledTimes(1);
    expect(out.status).toBe(ItensStatus.EXTRAIDO);
    expect(out.itens).toHaveLength(1);
    expect(out.formato).toBe('xlsx');
    expect(out.documentoNome).toBe('Planilha Orçamentária.xlsx');
    expect(out.custoUsd).toBe(0.005);
  });

  it('IA diz temPlanilha=false → indisponível (cai no import manual)', async () => {
    repo.findOne.mockResolvedValue(null);
    editais.findOne.mockResolvedValue(edital);
    ia.extrairItens.mockResolvedValue({
      ...extracaoItensOk,
      resultado: { temPlanilha: false, itens: [] },
    });

    const out = await service.getOrExtract('e1');
    expect(out.status).toBe(ItensStatus.INDISPONIVEL);
  });

  it('IA falha → status erro (re-tentável)', async () => {
    repo.findOne.mockResolvedValue(null);
    editais.findOne.mockResolvedValue(edital);
    ia.extrairItens.mockRejectedValue(new Error('429'));

    const out = await service.getOrExtract('e1');
    expect(out.status).toBe(ItensStatus.ERRO);
    expect(out.itens).toBeNull();
  });

  it('documento sem score de planilha é ignorado → indisponível sem IA', async () => {
    repo.findOne.mockResolvedValue(null);
    editais.findOne.mockResolvedValue(edital);
    connector.fetchEditalDocuments.mockResolvedValue([
      { nome: 'EDITAL.pdf', url: 'u' }, // score 0 — não é planilha
    ]);

    const out = await service.getOrExtract('e1');

    expect(planilhas.extrairDeUrl).not.toHaveBeenCalled();
    expect(ia.extrairItens).not.toHaveBeenCalled();
    expect(out.status).toBe(ItensStatus.INDISPONIVEL);
  });

  it('dedup: acessos concorrentes disparam só 1 extração', async () => {
    repo.findOne.mockResolvedValue(null);
    editais.findOne.mockResolvedValue(edital);

    await Promise.all([service.getOrExtract('e1'), service.getOrExtract('e1')]);

    expect(ia.extrairItens).toHaveBeenCalledTimes(1);
  });
});
