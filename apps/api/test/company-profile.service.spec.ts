import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Atestado } from '../src/company-profile/atestado.entity';
import { Certidao } from '../src/company-profile/certidao.entity';
import { CertidaoArquivo } from '../src/company-profile/certidao-arquivo.entity';
import { CertidaoTipo } from '../src/company-profile/certidao-tipo.enum';
import { CompanyProfile } from '../src/company-profile/company-profile.entity';
import { CompanyProfileService } from '../src/company-profile/company-profile.service';
import { ExigenciasService } from '../src/editais/exigencias/exigencias.service';

// Repositório fake: create devolve uma cópia nova (como o TypeORM real, que não
// devolve o mesmo objeto recebido); save acrescenta id/timestamps.
function fakeRepo() {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    count: jest.fn(),
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

// Arquivo de upload mínimo (forma do multer).
function uploadedPdf(over: Partial<Record<string, unknown>> = {}) {
  return {
    originalname: 'certidao.pdf',
    mimetype: 'application/pdf',
    size: 4,
    buffer: Buffer.from('%PDF'),
    ...over,
  } as unknown as Parameters<CompanyProfileService['uploadArquivo']>[2];
}

describe('CompanyProfileService', () => {
  let service: CompanyProfileService;
  let profiles: ReturnType<typeof fakeRepo>;
  let certidoes: ReturnType<typeof fakeRepo>;
  let atestados: ReturnType<typeof fakeRepo>;
  let arquivos: ReturnType<typeof fakeRepo>;

  beforeEach(() => {
    profiles = fakeRepo();
    certidoes = fakeRepo();
    atestados = fakeRepo();
    arquivos = fakeRepo();
    service = new CompanyProfileService(
      profiles as unknown as Repository<CompanyProfile>,
      certidoes as unknown as Repository<Certidao>,
      atestados as unknown as Repository<Atestado>,
      arquivos as unknown as Repository<CertidaoArquivo>,
      { getOrExtract: jest.fn() } as unknown as ExigenciasService,
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
      arquivos.find.mockResolvedValue([
        {
          certidaoId: 'c1',
          nomeArquivo: 'crf.pdf',
          mimeType: 'application/pdf',
          tamanhoBytes: 1234,
        },
      ]);

      const snap = await service.getFull('u1');

      expect(snap.profile?.razaoSocial).toBe('Construtora X');
      expect(snap.profile).not.toHaveProperty('userId');
      expect(snap.certidoes[0]).not.toHaveProperty('userId');
      expect(snap.atestados[0]).not.toHaveProperty('userId');
      // metadados do arquivo entram; o conteudo (bytea) nunca.
      expect(snap.certidoes[0].arquivo).toEqual({
        nomeArquivo: 'crf.pdf',
        mimeType: 'application/pdf',
        tamanhoBytes: 1234,
      });
      expect(snap.certidoes[0].arquivo).not.toHaveProperty('conteudo');
    });

    it('certidão sem arquivo → arquivo: null', async () => {
      profiles.findOne.mockResolvedValue(null);
      certidoes.find.mockResolvedValue([
        { id: 'c1', userId: 'u1', tipo: CertidaoTipo.FGTS },
      ]);
      atestados.find.mockResolvedValue([]);
      arquivos.find.mockResolvedValue([]);

      const snap = await service.getFull('u1');

      expect(snap.certidoes[0].arquivo).toBeNull();
    });

    it('profile = null quando o perfil ainda não existe', async () => {
      profiles.findOne.mockResolvedValue(null);
      certidoes.find.mockResolvedValue([]);
      atestados.find.mockResolvedValue([]);

      const snap = await service.getFull('u1');

      expect(snap.profile).toBeNull();
      expect(snap.certidoes).toEqual([]);
      // sem certidões, nem consulta a tabela de arquivos
      expect(arquivos.find).not.toHaveBeenCalled();
    });
  });

  describe('arquivo da certidão', () => {
    it('upload: 404 quando a certidão não é do usuário (não salva)', async () => {
      certidoes.count.mockResolvedValue(0);
      await expect(
        service.uploadArquivo('u1', 'c1', uploadedPdf()),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(arquivos.save).not.toHaveBeenCalled();
    });

    it('upload: mime não suportado → 400', async () => {
      certidoes.count.mockResolvedValue(1);
      await expect(
        service.uploadArquivo(
          'u1',
          'c1',
          uploadedPdf({ mimetype: 'text/plain' }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(arquivos.save).not.toHaveBeenCalled();
    });

    it('upload: acima de 10 MB → 400', async () => {
      certidoes.count.mockResolvedValue(1);
      const grande = uploadedPdf({
        buffer: { length: 10 * 1024 * 1024 + 1 } as Buffer,
      });
      await expect(
        service.uploadArquivo('u1', 'c1', grande),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(arquivos.save).not.toHaveBeenCalled();
    });

    it('upload: ok → salva e devolve só os metadados (sem conteudo)', async () => {
      certidoes.count.mockResolvedValue(1);
      arquivos.findOne.mockResolvedValue(null);

      const meta = await service.uploadArquivo('u1', 'c1', uploadedPdf());

      expect(arquivos.create).toHaveBeenCalledWith(
        expect.objectContaining({
          certidaoId: 'c1',
          mimeType: 'application/pdf',
        }),
      );
      expect(meta).toEqual({
        nomeArquivo: 'certidao.pdf',
        mimeType: 'application/pdf',
        tamanhoBytes: 4,
      });
      expect(meta).not.toHaveProperty('conteudo');
    });

    it('upload: re-upload substitui (reusa o id existente)', async () => {
      certidoes.count.mockResolvedValue(1);
      arquivos.findOne.mockResolvedValue({ id: 'arq-1' });

      await service.uploadArquivo('u1', 'c1', uploadedPdf());

      expect(arquivos.create).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'arq-1', certidaoId: 'c1' }),
      );
    });

    it('download: 404 quando a certidão não é do usuário', async () => {
      certidoes.count.mockResolvedValue(0);
      await expect(service.getArquivo('u1', 'c1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('download: 404 quando não há arquivo', async () => {
      certidoes.count.mockResolvedValue(1);
      arquivos.findOne.mockResolvedValue(null);
      await expect(service.getArquivo('u1', 'c1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('remove: 404 quando não havia arquivo', async () => {
      certidoes.count.mockResolvedValue(1);
      arquivos.delete.mockResolvedValue({ affected: 0 });
      await expect(service.removeArquivo('u1', 'c1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('remove: apaga por certidaoId', async () => {
      certidoes.count.mockResolvedValue(1);
      arquivos.delete.mockResolvedValue({ affected: 1 });
      await service.removeArquivo('u1', 'c1');
      expect(arquivos.delete).toHaveBeenCalledWith({ certidaoId: 'c1' });
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

  describe('getProntidaoGenerica', () => {
    it('passa os dados do perfil ao motor (atestado conta, capital, registro)', async () => {
      profiles.findOne.mockResolvedValue({
        userId: 'u1',
        capitalSocial: 150000,
        registroProfissionalTipo: 'CREA',
        registroProfissionalNumero: 'SC-1',
      });
      certidoes.find.mockResolvedValue([
        { tipo: CertidaoTipo.FGTS, dataValidade: '2099-01-01' },
      ]);
      atestados.count.mockResolvedValue(2);

      const r = await service.getProntidaoGenerica('u1');

      expect(atestados.count).toHaveBeenCalledWith({ where: { userId: 'u1' } });
      // capacidade técnica (atestados), capital e registro atendidos.
      expect(r.itens.find((i) => i.key === 'capacidade_tecnica')?.status).toBe(
        'atendido',
      );
      expect(r.itens.find((i) => i.key === 'capital_social')?.status).toBe(
        'atendido',
      );
      expect(r.itens.find((i) => i.key === 'registro_conselho')?.status).toBe(
        'atendido',
      );
      expect(r.percentual).toBeGreaterThan(0);
    });

    it('perfil inexistente: capital/registro contam como não atendidos', async () => {
      profiles.findOne.mockResolvedValue(null);
      certidoes.find.mockResolvedValue([]);
      atestados.count.mockResolvedValue(0);

      const r = await service.getProntidaoGenerica('u1');

      expect(r.atendidos).toBe(0);
      expect(r.percentual).toBe(0);
    });
  });
});
