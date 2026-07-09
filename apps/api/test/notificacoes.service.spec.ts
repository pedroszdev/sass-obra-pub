import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { AlertasService } from '../src/alertas/alertas.service';
import { AlertaItem } from '../src/alertas/alertas.types';
import { CompanyProfileService } from '../src/company-profile/company-profile.service';
import { MailService } from '../src/mail/mail.service';
import { NotificationLog } from '../src/notificacoes/notification-log.entity';
import { NotificacoesService } from '../src/notificacoes/notificacoes.service';
import { User } from '../src/users/user.entity';
import { UsersService } from '../src/users/users.service';

function alerta(over: Partial<AlertaItem> = {}): AlertaItem {
  return {
    id: 'documento:TRABALHISTA:2026-07-10',
    cat: 'documento',
    titulo: 'CNDT vence em 10 dias',
    detalhe: 'Renove em ...',
    data: '2026-07-01T00:00:00Z',
    novo: true,
    href: '/documentos',
    ...over,
  };
}

describe('NotificacoesService (T-103)', () => {
  let service: NotificacoesService;
  let users: { find: jest.Mock };
  let log: { find: jest.Mock; createQueryBuilder: jest.Mock };
  let alertas: { listar: jest.Mock };
  let mail: { sendMail: jest.Mock };
  let companyProfile: { getEditaisAptos: jest.Mock };
  let usersService: { getMunicipiosPreferidos: jest.Mock };
  let insertValues: jest.Mock;
  let insertExecute: jest.Mock;

  beforeEach(() => {
    users = { find: jest.fn().mockResolvedValue([]) };
    insertExecute = jest.fn().mockResolvedValue(undefined);
    insertValues = jest.fn(() => ({
      orIgnore: () => ({ execute: insertExecute }),
    }));
    log = {
      find: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn(() => ({
        insert: () => ({ into: () => ({ values: insertValues }) }),
      })),
    };
    alertas = {
      listar: jest.fn().mockResolvedValue({ itens: [], naoLidos: 0 }),
    };
    mail = { sendMail: jest.fn().mockResolvedValue(undefined) };
    companyProfile = {
      getEditaisAptos: jest.fn().mockResolvedValue({ data: [] }),
    };
    usersService = {
      getMunicipiosPreferidos: jest.fn().mockResolvedValue([]),
    };
    const config = { get: jest.fn((_k: string, d: unknown) => d) };
    service = new NotificacoesService(
      users as unknown as Repository<User>,
      log as unknown as Repository<NotificationLog>,
      alertas as unknown as AlertasService,
      mail as unknown as MailService,
      config as unknown as ConfigService,
      companyProfile as unknown as CompanyProfileService,
      usersService as unknown as UsersService,
    );
  });

  const usuario = (over: Partial<User> = {}) =>
    ({
      id: 'u1',
      name: 'Fulano',
      email: 'a@b.com',
      uf: 'SC',
      notificationPrefs: { whatsapp: true, email: true },
      ...over,
    }) as User;

  const editalApto = (over: Record<string, unknown> = {}) => ({
    id: 'e1',
    objeto: 'Pavimentação da Rua X',
    orgaoNome: 'Prefeitura',
    municipioNome: 'Lages',
    uf: 'SC',
    valorEstimado: 1_500_000,
    veredito: 'apto',
    ...over,
  });

  it('não manda para quem tem o e-mail desligado', async () => {
    users.find.mockResolvedValue([
      usuario({ notificationPrefs: { whatsapp: true, email: false } }),
    ]);
    alertas.listar.mockResolvedValue({ itens: [alerta()], naoLidos: 1 });
    expect(await service.enviarPendentes()).toBe(0);
    expect(mail.sendMail).not.toHaveBeenCalled();
  });

  it('só notifica cats acionáveis (documento/prazo), ignora ia/orcamento', async () => {
    users.find.mockResolvedValue([usuario()]);
    alertas.listar.mockResolvedValue({
      itens: [alerta({ id: 'ia:x', cat: 'ia' })],
      naoLidos: 1,
    });
    expect(await service.enviarPendentes()).toBe(0);
    expect(mail.sendMail).not.toHaveBeenCalled();
  });

  it('não reenvia alerta já logado', async () => {
    users.find.mockResolvedValue([usuario()]);
    alertas.listar.mockResolvedValue({ itens: [alerta()], naoLidos: 1 });
    log.find.mockResolvedValue([
      { alertaId: 'documento:TRABALHISTA:2026-07-10' },
    ]);
    expect(await service.enviarPendentes()).toBe(0);
    expect(mail.sendMail).not.toHaveBeenCalled();
  });

  it('manda 1 e-mail com os novos e registra no log', async () => {
    users.find.mockResolvedValue([usuario()]);
    alertas.listar.mockResolvedValue({
      itens: [
        alerta(),
        alerta({
          id: 'prazo:e1',
          cat: 'prazo',
          titulo: 'Proposta fecha em 3 dias',
          href: '/agenda',
        }),
      ],
      naoLidos: 2,
    });
    const enviados = await service.enviarPendentes();
    expect(enviados).toBe(1);
    expect(mail.sendMail).toHaveBeenCalledTimes(1);
    // url absoluta a partir da rota interna.
    const enviado = mail.sendMail.mock.calls[0][0];
    expect(enviado.html).toContain('http://localhost:5173/documentos');
    // logou os 2 alertas novos.
    expect(insertValues).toHaveBeenCalledWith([
      {
        userId: 'u1',
        alertaId: 'documento:TRABALHISTA:2026-07-10',
        canal: 'email',
      },
      { userId: 'u1', alertaId: 'prazo:e1', canal: 'email' },
    ]);
    expect(insertExecute).toHaveBeenCalledTimes(1);
  });

  describe('enviarObraDoDia (T-135)', () => {
    it('manda a obra apta nova e loga por edital', async () => {
      users.find.mockResolvedValue([usuario()]);
      companyProfile.getEditaisAptos.mockResolvedValue({
        data: [editalApto()],
      });
      const enviados = await service.enviarObraDoDia();
      expect(enviados).toBe(1);
      const enviado = mail.sendMail.mock.calls[0][0];
      expect(enviado.html).toContain('Pavimentação da Rua X');
      expect(enviado.html).toContain('http://localhost:5173/editais/e1');
      expect(insertValues).toHaveBeenCalledWith({
        userId: 'u1',
        alertaId: 'obra_do_dia:e1',
        canal: 'email',
      });
    });

    it('ignora "quase" — só APTO vira obra do dia', async () => {
      users.find.mockResolvedValue([usuario()]);
      companyProfile.getEditaisAptos.mockResolvedValue({
        data: [editalApto({ veredito: 'quase' })],
      });
      expect(await service.enviarObraDoDia()).toBe(0);
      expect(mail.sendMail).not.toHaveBeenCalled();
    });

    it('não repete a mesma obra já enviada', async () => {
      users.find.mockResolvedValue([usuario()]);
      companyProfile.getEditaisAptos.mockResolvedValue({
        data: [editalApto()],
      });
      log.find.mockResolvedValue([{ alertaId: 'obra_do_dia:e1' }]);
      expect(await service.enviarObraDoDia()).toBe(0);
      expect(mail.sendMail).not.toHaveBeenCalled();
    });

    it('pula usuário sem UF (sem região, sem obra do dia)', async () => {
      users.find.mockResolvedValue([usuario({ uf: null })]);
      expect(await service.enviarObraDoDia()).toBe(0);
      expect(companyProfile.getEditaisAptos).not.toHaveBeenCalled();
    });
  });
});
