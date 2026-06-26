import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Edital } from '../src/editais/edital.entity';
import { Proposta } from '../src/propostas/proposta.entity';
import { PropostaItem } from '../src/propostas/proposta-item.entity';
import { PropostaStatus } from '../src/propostas/proposta-status.enum';
import { PropostasService } from '../src/propostas/propostas.service';

const D = new Date('2026-06-26T12:00:00Z');

const proposta = (over: Partial<Proposta> = {}): Proposta =>
  ({
    id: 'p1',
    userId: 'u1',
    editalId: 'e1',
    titulo: 'Proposta X',
    status: PropostaStatus.RASCUNHO,
    bdiPercentual: 10,
    valorReferencia: 500,
    createdAt: D,
    updatedAt: D,
    ...over,
  }) as unknown as Proposta;

const item = (over: Partial<PropostaItem> = {}): PropostaItem =>
  ({
    id: 'i1',
    propostaId: 'p1',
    descricao: 'Escavação',
    unidade: 'm3',
    quantidade: 100,
    precoUnitario: 50,
    ordem: 0,
    createdAt: D,
    updatedAt: D,
    ...over,
  }) as unknown as PropostaItem;

describe('PropostasService', () => {
  let service: PropostasService;
  let propostas: {
    findOne: jest.Mock;
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
    count: jest.Mock;
  };
  let itens: {
    findOne: jest.Mock;
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
    update: jest.Mock;
  };
  let editais: { findOne: jest.Mock };

  beforeEach(() => {
    propostas = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn((x: Partial<Proposta>) => x),
      save: jest.fn((x: Partial<Proposta>) =>
        Promise.resolve(proposta(x as Partial<Proposta>)),
      ),
      delete: jest.fn(),
      count: jest.fn(),
    };
    itens = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn((x: Partial<PropostaItem>) => x),
      save: jest.fn((x: Partial<PropostaItem>) =>
        Promise.resolve(item(x as Partial<PropostaItem>)),
      ),
      delete: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    };
    editais = { findOne: jest.fn() };
    service = new PropostasService(
      propostas as unknown as Repository<Proposta>,
      itens as unknown as Repository<PropostaItem>,
      editais as unknown as Repository<Edital>,
    );
  });

  describe('create', () => {
    it('404 quando o edital não existe (não salva)', async () => {
      editais.findOne.mockResolvedValue(null);
      await expect(
        service.create('u1', { titulo: 'X', editalId: 'e1' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(propostas.save).not.toHaveBeenCalled();
    });

    it('pré-preenche valorReferencia com o valor estimado do edital', async () => {
      editais.findOne.mockResolvedValue({ id: 'e1', valorEstimado: 777 });
      const res = await service.create('u1', { titulo: 'X', editalId: 'e1' });
      expect(propostas.create).toHaveBeenCalledWith(
        expect.objectContaining({ valorReferencia: 777, editalId: 'e1' }),
      );
      expect(res.valorReferencia).toBe(777);
      expect(res.status).toBe(PropostaStatus.RASCUNHO);
    });

    it('respeita valorReferencia do body quando informado', async () => {
      editais.findOne.mockResolvedValue({ id: 'e1', valorEstimado: 777 });
      await service.create('u1', {
        titulo: 'X',
        editalId: 'e1',
        valorReferencia: 123,
      });
      expect(propostas.create).toHaveBeenCalledWith(
        expect.objectContaining({ valorReferencia: 123 }),
      );
    });
  });

  describe('findOne', () => {
    it('404 quando não é do dono', async () => {
      propostas.findOne.mockResolvedValue(null);
      await expect(service.findOne('u1', 'p1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('retorna a proposta com seus itens', async () => {
      propostas.findOne.mockResolvedValue(proposta());
      itens.find.mockResolvedValue([item({ id: 'a' }), item({ id: 'b' })]);
      const res = await service.findOne('u1', 'p1');
      expect(res.id).toBe('p1');
      expect(res.itens.map((i) => i.id)).toEqual(['a', 'b']);
      expect(itens.find).toHaveBeenCalledWith({
        where: { propostaId: 'p1' },
        order: { ordem: 'ASC', createdAt: 'ASC' },
      });
    });
  });

  describe('update', () => {
    it('404 quando não é do dono', async () => {
      propostas.findOne.mockResolvedValue(null);
      await expect(
        service.update('u1', 'p1', { titulo: 'Novo' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('faz merge só do que foi enviado', async () => {
      propostas.findOne.mockResolvedValue(
        proposta({ titulo: 'Antigo', bdiPercentual: 10 }),
      );
      await service.update('u1', 'p1', { titulo: 'Novo' });
      const salvo = propostas.save.mock.calls[0][0] as Proposta;
      expect(salvo.titulo).toBe('Novo');
      expect(salvo.bdiPercentual).toBe(10); // intacto
    });
  });

  describe('remove', () => {
    it('404 quando nada foi apagado', async () => {
      propostas.delete.mockResolvedValue({ affected: 0 });
      await expect(service.remove('u1', 'p1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('apaga por (id, userId)', async () => {
      propostas.delete.mockResolvedValue({ affected: 1 });
      await service.remove('u1', 'p1');
      expect(propostas.delete).toHaveBeenCalledWith({ id: 'p1', userId: 'u1' });
    });
  });

  describe('itens', () => {
    it('addItem: 404 quando a proposta não é do dono', async () => {
      propostas.count.mockResolvedValue(0);
      await expect(
        service.addItem('u1', 'p1', { descricao: 'X' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('addItem: anexa ao fim (ordem = última + 1)', async () => {
      propostas.count.mockResolvedValue(1);
      itens.findOne.mockResolvedValue(item({ ordem: 2 }));
      await service.addItem('u1', 'p1', { descricao: 'Novo' });
      expect(itens.create).toHaveBeenCalledWith(
        expect.objectContaining({ ordem: 3, propostaId: 'p1' }),
      );
    });

    it('addItem: primeiro item recebe ordem 0', async () => {
      propostas.count.mockResolvedValue(1);
      itens.findOne.mockResolvedValue(null);
      await service.addItem('u1', 'p1', { descricao: 'Primeiro' });
      expect(itens.create).toHaveBeenCalledWith(
        expect.objectContaining({ ordem: 0 }),
      );
    });

    it('updateItem: 404 quando o item não é da proposta', async () => {
      propostas.count.mockResolvedValue(1);
      itens.findOne.mockResolvedValue(null);
      await expect(
        service.updateItem('u1', 'p1', 'i9', { descricao: 'X' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('removeItem: 404 quando nada foi apagado', async () => {
      propostas.count.mockResolvedValue(1);
      itens.delete.mockResolvedValue({ affected: 0 });
      await expect(service.removeItem('u1', 'p1', 'i9')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('reordenarItens', () => {
    it('400 quando o conjunto não bate com os itens', async () => {
      propostas.count.mockResolvedValue(1);
      itens.find.mockResolvedValue([
        item({ id: 'a' }),
        item({ id: 'b' }),
        item({ id: 'c' }),
      ]);
      await expect(
        service.reordenarItens('u1', 'p1', ['a', 'b']),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(itens.update).not.toHaveBeenCalled();
    });

    it('400 quando há ids duplicados', async () => {
      propostas.count.mockResolvedValue(1);
      itens.find.mockResolvedValue([item({ id: 'a' }), item({ id: 'b' })]);
      await expect(
        service.reordenarItens('u1', 'p1', ['a', 'a']),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('grava ordem = índice para cada item', async () => {
      propostas.count.mockResolvedValue(1);
      itens.find.mockResolvedValue([
        item({ id: 'a' }),
        item({ id: 'b' }),
        item({ id: 'c' }),
      ]);
      await service.reordenarItens('u1', 'p1', ['c', 'a', 'b']);
      expect(itens.update).toHaveBeenCalledWith(
        { id: 'c', propostaId: 'p1' },
        { ordem: 0 },
      );
      expect(itens.update).toHaveBeenCalledWith(
        { id: 'a', propostaId: 'p1' },
        { ordem: 1 },
      );
      expect(itens.update).toHaveBeenCalledWith(
        { id: 'b', propostaId: 'p1' },
        { ordem: 2 },
      );
    });
  });
});
