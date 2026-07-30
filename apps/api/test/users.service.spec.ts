import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { Atestado } from '../src/company-profile/atestado.entity';
import { Certidao } from '../src/company-profile/certidao.entity';
import { CompanyProfile } from '../src/company-profile/company-profile.entity';
import { Favorito } from '../src/favoritos/favorito.entity';
import { Municipio } from '../src/geo/municipio.entity';
import { GoogleVerifierService } from '../src/auth/google/google-verifier.service';
import { Proposta } from '../src/propostas/proposta.entity';
import { UserMunicipio } from '../src/users/user-municipio.entity';
import { User } from '../src/users/user.entity';
import { UsersService } from '../src/users/users.service';

// QueryBuilder encadeável cujo getRawMany resolve o valor dado.
function fakeQb(rows: unknown[]) {
  const qb: Record<string, jest.Mock> = {};
  for (const m of ['innerJoin', 'select', 'addSelect', 'where', 'orderBy']) {
    qb[m] = jest.fn(() => qb);
  }
  qb.getRawMany = jest.fn().mockResolvedValue(rows);
  return qb;
}

// Repo simples com find/findOne/delete (para a exportação/exclusão LGPD).
function fakeRepo() {
  return {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
  };
}

describe('UsersService (T-94/T-102)', () => {
  let service: UsersService;
  let users: {
    createQueryBuilder: jest.Mock;
    findOne: jest.Mock;
    delete: jest.Mock;
    save: jest.Mock;
  };
  let userMunicipios: {
    createQueryBuilder: jest.Mock;
    manager: { transaction: jest.Mock };
  };
  let municipios: { count: jest.Mock };
  let profiles: ReturnType<typeof fakeRepo>;
  let certidoes: ReturnType<typeof fakeRepo>;
  let atestados: ReturnType<typeof fakeRepo>;
  let propostas: ReturnType<typeof fakeRepo>;
  let favoritos: ReturnType<typeof fakeRepo>;
  let google: { verificar: jest.Mock };
  let managerDelete: jest.Mock;
  let managerInsert: jest.Mock;

  beforeEach(() => {
    users = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      save: jest.fn((u: unknown) => Promise.resolve(u)),
    };
    managerDelete = jest.fn().mockResolvedValue(undefined);
    managerInsert = jest.fn().mockResolvedValue(undefined);
    userMunicipios = {
      createQueryBuilder: jest.fn(() => fakeQb([])),
      manager: {
        transaction: jest.fn((cb: (m: unknown) => Promise<void>) =>
          cb({ delete: managerDelete, insert: managerInsert }),
        ),
      },
    };
    municipios = { count: jest.fn() };
    profiles = fakeRepo();
    certidoes = fakeRepo();
    atestados = fakeRepo();
    propostas = fakeRepo();
    favoritos = fakeRepo();
    google = { verificar: jest.fn() };
    service = new UsersService(
      users as unknown as Repository<User>,
      userMunicipios as unknown as Repository<UserMunicipio>,
      municipios as unknown as Repository<Municipio>,
      profiles as unknown as Repository<CompanyProfile>,
      certidoes as unknown as Repository<Certidao>,
      atestados as unknown as Repository<Atestado>,
      propostas as unknown as Repository<Proposta>,
      favoritos as unknown as Repository<Favorito>,
      google as unknown as GoogleVerifierService,
    );
  });

  it('rejeita mais de 20 municípios (sem tocar o banco)', async () => {
    const codigos = Array.from({ length: 21 }, (_, i) =>
      String(4200000 + i).padStart(7, '0'),
    );
    await expect(
      service.setMunicipiosPreferidos('u1', codigos),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(municipios.count).not.toHaveBeenCalled();
  });

  it('rejeita código inexistente (count não bate com os únicos)', async () => {
    municipios.count.mockResolvedValue(1); // só 1 dos 2 existe
    await expect(
      service.setMunicipiosPreferidos('u1', ['4200051', '9999999']),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(managerInsert).not.toHaveBeenCalled();
  });

  it('deduplica e substitui numa transação (delete + insert)', async () => {
    municipios.count.mockResolvedValue(1); // 1 código único
    await service.setMunicipiosPreferidos('u1', ['4205407', '4205407']);
    expect(userMunicipios.manager.transaction).toHaveBeenCalledTimes(1);
    expect(managerDelete).toHaveBeenCalledWith(UserMunicipio, { userId: 'u1' });
    expect(managerInsert).toHaveBeenCalledWith(UserMunicipio, [
      { userId: 'u1', codigoIbge: '4205407' },
    ]);
  });

  it('lista vazia limpa tudo e não insere', async () => {
    await service.setMunicipiosPreferidos('u1', []);
    expect(municipios.count).not.toHaveBeenCalled(); // nada a validar
    expect(managerDelete).toHaveBeenCalledWith(UserMunicipio, { userId: 'u1' });
    expect(managerInsert).not.toHaveBeenCalled();
  });

  it('findDistinctUfs une a UF de cadastro com a dos municípios preferidos', async () => {
    users.createQueryBuilder.mockReturnValue(fakeQb([{ uf: 'SC' }]));
    userMunicipios.createQueryBuilder.mockReturnValue(
      fakeQb([{ uf: 'RJ' }, { uf: 'SC' }]),
    );
    const ufs = await service.findDistinctUfs();
    expect([...ufs].sort()).toEqual(['RJ', 'SC']); // sem duplicar SC
  });

  describe('LGPD — export e exclusão (T-102)', () => {
    it('exportarDados agrega as tabelas do titular, sem senha', async () => {
      users.findOne.mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
        name: 'Fulano',
        passwordHash: 'hash-secreto',
        cnpj: null,
        porte: null,
        uf: 'SC',
      });
      certidoes.find.mockResolvedValue([{ id: 'c1' }]);
      favoritos.find.mockResolvedValue([
        { editalId: 'e1', createdAt: new Date('2026-07-01') },
      ]);
      userMunicipios.createQueryBuilder.mockReturnValue(fakeQb([]));

      const dump = await service.exportarDados('u1');

      expect(dump.conta).not.toHaveProperty('passwordHash');
      expect((dump.conta as { email: string }).email).toBe('a@b.com');
      expect(dump.certidoes).toHaveLength(1);
      expect(dump.favoritos).toEqual([
        { editalId: 'e1', createdAt: expect.any(Date) },
      ]);
    });

    it('exportarDados 404 quando o usuário não existe', async () => {
      users.findOne.mockResolvedValue(null);
      await expect(service.exportarDados('u1')).rejects.toThrow();
    });

    it('excluirConta com senha correta apaga (cascade)', async () => {
      const hash = await bcrypt.hash('minhaSenha', 4);
      users.findOne.mockResolvedValue({ id: 'u1', passwordHash: hash });
      await service.excluirConta('u1', { senha: 'minhaSenha' });
      expect(users.delete).toHaveBeenCalledWith({ id: 'u1' });
    });

    it('excluirConta com senha errada → 401, não apaga', async () => {
      const hash = await bcrypt.hash('minhaSenha', 4);
      users.findOne.mockResolvedValue({ id: 'u1', passwordHash: hash });
      await expect(
        service.excluirConta('u1', { senha: 'errada' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(users.delete).not.toHaveBeenCalled();
    });

    // T-126 — conta sem senha (Google): re-autenticação por id_token fresco.
    it('excluirConta de conta Google apaga quando o sub do id_token bate', async () => {
      users.findOne.mockResolvedValue({
        id: 'u1',
        passwordHash: null,
        googleSub: 'sub-1',
      });
      google.verificar.mockResolvedValue({
        sub: 'sub-1',
        email: 'f@e.com',
        name: 'F',
      });

      await service.excluirConta('u1', { idToken: 'tok' });

      expect(users.delete).toHaveBeenCalledWith({ id: 'u1' });
    });

    // O ataque que a verificação sozinha NÃO pega: o id_token é legítimo e passa
    // na assinatura/audiência, mas pertence a outra pessoa. Só o `sub` autoriza.
    it('excluirConta recusa id_token válido de OUTRA conta Google', async () => {
      users.findOne.mockResolvedValue({
        id: 'u1',
        passwordHash: null,
        googleSub: 'sub-do-dono',
      });
      google.verificar.mockResolvedValue({
        sub: 'sub-de-outro',
        email: 'outro@e.com',
        name: 'Outro',
      });

      await expect(
        service.excluirConta('u1', { idToken: 'tok-legitimo-de-outro' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(users.delete).not.toHaveBeenCalled();
    });

    it('excluirConta de conta Google sem id_token → 401, não apaga', async () => {
      users.findOne.mockResolvedValue({
        id: 'u1',
        passwordHash: null,
        googleSub: 'sub-1',
      });

      await expect(
        service.excluirConta('u1', { senha: 'chute' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(google.verificar).not.toHaveBeenCalled();
      expect(users.delete).not.toHaveBeenCalled();
    });
  });

  // T-225 — o CNPJ virou obrigatório porque o Asaas (Épico 17) exige CPF ou CNPJ
  // para criar cliente. Estes testes guardam as DUAS regras que não são óbvias
  // lendo o endpoint: preencher só quando está vazio, e traduzir a violação do
  // índice único em 409 em vez de deixar subir como 500.
  describe('setCnpj (T-225)', () => {
    it('grava o CNPJ quando a conta ainda não tem', async () => {
      users.findOne.mockResolvedValue({ id: 'u1', cnpj: null });

      const salvo = await service.setCnpj('u1', '11222333000181');

      expect(salvo.cnpj).toBe('11222333000181');
      expect(users.save).toHaveBeenCalledTimes(1);
    });

    it('reenviar o MESMO CNPJ é no-op, não erro (idempotência)', async () => {
      users.findOne.mockResolvedValue({ id: 'u1', cnpj: '11222333000181' });

      await expect(
        service.setCnpj('u1', '11222333000181'),
      ).resolves.toMatchObject({ cnpj: '11222333000181' });
      expect(users.save).not.toHaveBeenCalled();
    });

    it('NÃO troca um CNPJ já gravado — isso é mudar a identidade fiscal', async () => {
      // O CNPJ vai para a cobrança e para a NFS-e (T-219). Deixar o próprio
      // usuário trocá-lo por um PUT permitiria alterar o documento da nota
      // depois de emitida. Alteração passa por suporte/admin.
      users.findOne.mockResolvedValue({ id: 'u1', cnpj: '11222333000181' });

      await expect(
        service.setCnpj('u1', '04252011000110'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(users.save).not.toHaveBeenCalled();
    });

    it('CNPJ de outra conta vira 409, não 500', async () => {
      // `users.cnpj` é único (um CNPJ = uma conta). Conferir antes seria uma
      // corrida — duas requisições simultâneas passariam as duas. Quem decide é
      // o índice; o serviço só traduz o erro do Postgres.
      users.findOne.mockResolvedValue({ id: 'u1', cnpj: null });
      users.save.mockRejectedValue({ code: '23505' });

      await expect(
        service.setCnpj('u1', '11222333000181'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('erro que NÃO é violação de unicidade continua subindo', async () => {
      // Guarda contra a preguiça de tratar todo erro do banco como 409, que
      // esconderia falha real de infraestrutura atrás de mensagem de negócio.
      users.findOne.mockResolvedValue({ id: 'u1', cnpj: null });
      users.save.mockRejectedValue(new Error('conexão caiu'));

      await expect(service.setCnpj('u1', '11222333000181')).rejects.toThrow(
        'conexão caiu',
      );
    });
  });
});
