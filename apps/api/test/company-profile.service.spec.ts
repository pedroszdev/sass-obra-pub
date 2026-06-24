import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Atestado } from '../src/company-profile/atestado.entity';
import { Certidao } from '../src/company-profile/certidao.entity';
import { CertidaoTipo } from '../src/company-profile/certidao-tipo.enum';
import { CompanyProfile } from '../src/company-profile/company-profile.entity';
import { CompanyProfileService } from '../src/company-profile/company-profile.service';

// Repositório fake: create devolve uma cópia nova (como o TypeORM real, que não
// devolve o mesmo objeto recebido); save acrescenta id/timestamps.
function fakeRepo() {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn((x: Record<string, unknown>) => ({ ...x })),
    save: jest.fn((x: Record<string, unknown>) =>
      Promise.resolve({
        id: x.id ?? 'generated-id',
        createdAt: new Date('2026-06-23T00:00:00Z'),
        updatedAt: new Date('2026-06-23T00:00:00Z'),
        ...x,
      }),
    ),
    delete: jest.fn(),
  };
}

describe('CompanyProfileService', () => {
  let service: CompanyProfileService;
  let profiles: ReturnType<typeof fakeRepo>;
  let certidoes: ReturnType<typeof fakeRepo>;
  let atestados: ReturnType<typeof fakeRepo>;

  beforeEach(() => {
    profiles = fakeRepo();
    certidoes = fakeRepo();
    atestados = fakeRepo();
    service = new CompanyProfileService(
      profiles as unknown as Repository<CompanyProfile>,
      certidoes as unknown as Repository<Certidao>,
      atestados as unknown as Repository<Atestado>,
    );
  });

  describe('getFull', () => {
    it('agrega perfil + certidões + atestados e omite o userId', async () => {
      profiles.findOne.mockResolvedValue({
        id: 'p1',
        userId: 'u1',
        razaoSocial: 'Construtora X',
        capitalSocial: 150000,
        registroProfissionalTipo: null,
        registroProfissionalNumero: null,
        registroProfissionalUf: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      certidoes.find.mockResolvedValue([
        { id: 'c1', userId: 'u1', tipo: CertidaoTipo.FGTS },
      ]);
      atestados.find.mockResolvedValue([
        { id: 'a1', userId: 'u1', descricao: 'Pavimentação' },
      ]);

      const snap = await service.getFull('u1');

      expect(snap.profile?.razaoSocial).toBe('Construtora X');
      expect(snap.profile).not.toHaveProperty('userId');
      expect(snap.certidoes[0]).not.toHaveProperty('userId');
      expect(snap.atestados[0]).not.toHaveProperty('userId');
    });

    it('profile = null quando o perfil ainda não existe', async () => {
      profiles.findOne.mockResolvedValue(null);
      certidoes.find.mockResolvedValue([]);
      atestados.find.mockResolvedValue([]);

      const snap = await service.getFull('u1');

      expect(snap.profile).toBeNull();
      expect(snap.certidoes).toEqual([]);
    });
  });

  describe('upsertProfile', () => {
    it('cria o perfil no 1º PUT (não existia)', async () => {
      profiles.findOne.mockResolvedValue(null);

      await service.upsertProfile('u1', { razaoSocial: 'Nova LTDA' });

      expect(profiles.create).toHaveBeenCalledWith({ userId: 'u1' });
      expect(profiles.save).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'u1', razaoSocial: 'Nova LTDA' }),
      );
    });

    it('faz merge só dos campos enviados (não zera o que já existe)', async () => {
      profiles.findOne.mockResolvedValue({
        id: 'p1',
        userId: 'u1',
        razaoSocial: 'Antiga LTDA',
        capitalSocial: 100000,
      });

      await service.upsertProfile('u1', { capitalSocial: 200000 });

      expect(profiles.save).toHaveBeenCalledWith(
        expect.objectContaining({
          razaoSocial: 'Antiga LTDA', // preservado
          capitalSocial: 200000, // atualizado
        }),
      );
    });
  });

  describe('certidões', () => {
    it('addCertidao: OUTRA sem descrição → 400 (não salva)', async () => {
      await expect(
        service.addCertidao('u1', { tipo: CertidaoTipo.OUTRA }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(certidoes.save).not.toHaveBeenCalled();
    });

    it('addCertidao: OUTRA com descrição → salva', async () => {
      const r = await service.addCertidao('u1', {
        tipo: CertidaoTipo.OUTRA,
        descricao: 'Certidão municipal de obras',
      });
      expect(certidoes.save).toHaveBeenCalled();
      expect(r).not.toHaveProperty('userId');
    });

    it('addCertidao: tipo padrão salva com userId', async () => {
      await service.addCertidao('u1', { tipo: CertidaoTipo.CND_FEDERAL });
      expect(certidoes.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tipo: CertidaoTipo.CND_FEDERAL,
          userId: 'u1',
        }),
      );
    });

    it('updateCertidao: 404 quando não é do usuário', async () => {
      certidoes.findOne.mockResolvedValue(null);
      await expect(
        service.updateCertidao('u1', 'c1', { numero: '123' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(certidoes.findOne).toHaveBeenCalledWith({
        where: { id: 'c1', userId: 'u1' },
      });
    });

    it('updateCertidao: mudar tipo p/ OUTRA sem descrição existente → 400', async () => {
      certidoes.findOne.mockResolvedValue({
        id: 'c1',
        userId: 'u1',
        tipo: CertidaoTipo.FGTS,
        descricao: null,
      });
      await expect(
        service.updateCertidao('u1', 'c1', { tipo: CertidaoTipo.OUTRA }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('removeCertidao: 404 quando nada foi apagado (não-dono/inexistente)', async () => {
      certidoes.delete.mockResolvedValue({ affected: 0 });
      await expect(service.removeCertidao('u1', 'c1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('removeCertidao: apaga por (id, userId)', async () => {
      certidoes.delete.mockResolvedValue({ affected: 1 });
      await service.removeCertidao('u1', 'c1');
      expect(certidoes.delete).toHaveBeenCalledWith({ id: 'c1', userId: 'u1' });
    });
  });

  describe('atestados', () => {
    it('addAtestado: salva com userId', async () => {
      await service.addAtestado('u1', { descricao: 'Ponte de concreto' });
      expect(atestados.create).toHaveBeenCalledWith(
        expect.objectContaining({
          descricao: 'Ponte de concreto',
          userId: 'u1',
        }),
      );
    });

    it('updateAtestado: 404 quando não é do usuário', async () => {
      atestados.findOne.mockResolvedValue(null);
      await expect(
        service.updateAtestado('u1', 'a1', { valor: 1000 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('removeAtestado: 404 quando nada foi apagado', async () => {
      atestados.delete.mockResolvedValue({ affected: 0 });
      await expect(service.removeAtestado('u1', 'a1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
