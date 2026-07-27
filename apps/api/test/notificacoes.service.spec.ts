import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { AlertasService } from '../src/alertas/alertas.service';
import { AlertaItem } from '../src/alertas/alertas.types';
import { Assinatura } from '../src/assinaturas/assinatura.entity';
import { AssinaturasService } from '../src/assinaturas/assinaturas.service';
import { StripeBillingService } from '../src/assinaturas/stripe-billing.service';
import { CompanyProfileService } from '../src/company-profile/company-profile.service';
import { EditaisSearchService } from '../src/editais/editais-search.service';
import { MailLog } from '../src/mail/mail-log.entity';
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
  let users: { find: jest.Mock; findOne: jest.Mock; update: jest.Mock };
  let log: {
    find: jest.Mock;
    findOne: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let mailLog: { find: jest.Mock };
  let alertas: { listar: jest.Mock };
  let mail: { sendMail: jest.Mock };
  let companyProfile: { getEditaisAptos: jest.Mock; temDocumentos: jest.Mock };
  let editaisSearch: { search: jest.Mock };
  let usersService: { getMunicipiosPreferidos: jest.Mock };
  let assinaturas: {
    anuaisRenovandoAte: jest.Mock;
    trialsExpirandoAte: jest.Mock;
    emPastDue: jest.Mock;
  };
  let billing: { listarPrecos: jest.Mock };
  let insertValues: jest.Mock;
  let insertExecute: jest.Mock;

  beforeEach(() => {
    users = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    insertExecute = jest.fn().mockResolvedValue(undefined);
    insertValues = jest.fn(() => ({
      orIgnore: () => ({ execute: insertExecute }),
    }));
    log = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      createQueryBuilder: jest.fn(() => ({
        insert: () => ({ into: () => ({ values: insertValues }) }),
      })),
    };
    mailLog = { find: jest.fn().mockResolvedValue([]) };
    alertas = {
      listar: jest.fn().mockResolvedValue({ itens: [], naoLidos: 0 }),
    };
    mail = { sendMail: jest.fn().mockResolvedValue(undefined) };
    companyProfile = {
      getEditaisAptos: jest.fn().mockResolvedValue({ data: [] }),
      temDocumentos: jest.fn().mockResolvedValue(false),
    };
    editaisSearch = {
      search: jest.fn().mockResolvedValue({ data: [] }),
    };
    usersService = {
      getMunicipiosPreferidos: jest.fn().mockResolvedValue([]),
    };
    assinaturas = {
      anuaisRenovandoAte: jest.fn().mockResolvedValue([]),
      trialsExpirandoAte: jest.fn().mockResolvedValue([]),
      emPastDue: jest.fn().mockResolvedValue([]),
    };
    billing = {
      listarPrecos: jest.fn().mockResolvedValue({
        mensal: {
          plano: 'mensal',
          priceId: 'p_m',
          valor: 14_900,
          moeda: 'brl',
        },
        anual: { plano: 'anual', priceId: 'p_a', valor: 149_000, moeda: 'brl' },
        economiaAnual: 29_800,
        mesesGratis: 2,
      }),
    };
    const config = { get: jest.fn((_k: string, d: unknown) => d) };
    service = new NotificacoesService(
      users as unknown as Repository<User>,
      log as unknown as Repository<NotificationLog>,
      mailLog as unknown as Repository<MailLog>,
      alertas as unknown as AlertasService,
      mail as unknown as MailService,
      config as unknown as ConfigService,
      companyProfile as unknown as CompanyProfileService,
      usersService as unknown as UsersService,
      assinaturas as unknown as AssinaturasService,
      billing as unknown as StripeBillingService,
      editaisSearch as unknown as EditaisSearchService,
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

  describe('enviarObraDoDia (T-135 ampliado — obras da região)', () => {
    const NOW = new Date('2026-07-27T10:00:00Z');

    it('há obra APTA: manda com selo e registra o dedup do dia', async () => {
      users.find.mockResolvedValue([usuario()]);
      companyProfile.getEditaisAptos.mockResolvedValue({
        data: [editalApto()],
      });
      editaisSearch.search.mockResolvedValue({ data: [editalApto()] });
      const enviados = await service.enviarObraDoDia(NOW);
      expect(enviados).toBe(1);
      const enviado = mail.sendMail.mock.calls[0][0];
      expect(enviado.html).toContain('Pavimentação da Rua X');
      expect(enviado.html).toContain('Você está apto');
      const registros = insertValues.mock.calls[0][0];
      expect(registros).toContainEqual({
        userId: 'u1',
        alertaId: 'regiao_diaria:2026-07-27',
        canal: 'email',
      });
    });

    it('sem obra apta, mas há obra na região: manda com CTA de perfil', async () => {
      users.find.mockResolvedValue([usuario()]);
      companyProfile.getEditaisAptos.mockResolvedValue({ data: [] });
      editaisSearch.search.mockResolvedValue({
        data: [editalApto({ veredito: undefined })],
      });
      expect(await service.enviarObraDoDia(NOW)).toBe(1);
      expect(mail.sendMail.mock.calls[0][0].html).toContain(
        'Completar meu perfil',
      );
    });

    it('região sem nenhuma obra: manda mesmo assim (decisão do dono)', async () => {
      users.find.mockResolvedValue([usuario()]);
      companyProfile.getEditaisAptos.mockResolvedValue({ data: [] });
      editaisSearch.search.mockResolvedValue({ data: [] });
      expect(await service.enviarObraDoDia(NOW)).toBe(1);
      expect(mail.sendMail.mock.calls[0][0].html).toContain(
        'Nenhuma obra aberta',
      );
    });

    it('não manda 2x no mesmo dia (dedup diário)', async () => {
      users.find.mockResolvedValue([usuario()]);
      editaisSearch.search.mockResolvedValue({ data: [editalApto()] });
      log.findOne.mockResolvedValue({ alertaId: 'regiao_diaria:2026-07-27' });
      expect(await service.enviarObraDoDia(NOW)).toBe(0);
      expect(mail.sendMail).not.toHaveBeenCalled();
    });

    it('pula usuário sem UF (sem região, sem envio)', async () => {
      users.find.mockResolvedValue([usuario({ uf: null })]);
      expect(await service.enviarObraDoDia(NOW)).toBe(0);
      expect(companyProfile.getEditaisAptos).not.toHaveBeenCalled();
    });

    it('pula quem descadastrou a obra do dia (obraDoDia=false)', async () => {
      users.find.mockResolvedValue([
        usuario({
          notificationPrefs: { whatsapp: true, email: true, obraDoDia: false },
        }),
      ]);
      editaisSearch.search.mockResolvedValue({ data: [editalApto()] });
      expect(await service.enviarObraDoDia(NOW)).toBe(0);
      expect(mail.sendMail).not.toHaveBeenCalled();
    });

    it('pula e-mail com bounce/reclamação registrado (supressão T-193)', async () => {
      users.find.mockResolvedValue([usuario()]);
      editaisSearch.search.mockResolvedValue({ data: [editalApto()] });
      mailLog.find.mockResolvedValue([{ para: 'a@b.com' }]); // deu bounce antes
      expect(await service.enviarObraDoDia(NOW)).toBe(0);
      expect(mail.sendMail).not.toHaveBeenCalled();
    });

    it('inclui o cabeçalho List-Unsubscribe no envio', async () => {
      users.find.mockResolvedValue([usuario()]);
      editaisSearch.search.mockResolvedValue({ data: [editalApto()] });
      await service.enviarObraDoDia(NOW);
      const enviado = mail.sendMail.mock.calls[0][0];
      expect(enviado.headers['List-Unsubscribe']).toContain(
        '/notificacoes/descadastrar?token=',
      );
      expect(enviado.headers['List-Unsubscribe-Post']).toBe(
        'List-Unsubscribe=One-Click',
      );
    });
  });

  describe('descadastrarObraDoDia (T-135)', () => {
    it('token válido desliga só obraDoDia, preserva o master', async () => {
      const { gerarTokenDescadastro } = jest.requireActual<
        typeof import('../src/notificacoes/descadastro-token')
      >('../src/notificacoes/descadastro-token');
      users.findOne.mockResolvedValue({
        id: 'u1',
        notificationPrefs: { whatsapp: true, email: true },
      });
      const token = gerarTokenDescadastro('u1', 'dev-unsub-secret');
      expect(await service.descadastrarObraDoDia(token)).toBe(true);
      const [, patch] = (users.update as jest.Mock).mock.calls[0] as [
        string,
        { notificationPrefs: { email: boolean; obraDoDia: boolean } },
      ];
      expect(patch.notificationPrefs.obraDoDia).toBe(false);
      expect(patch.notificationPrefs.email).toBe(true); // urgência preservada
    });

    it('token inválido → false, não toca no banco', async () => {
      expect(await service.descadastrarObraDoDia('lixo.forjado')).toBe(false);
      expect(users.update).not.toHaveBeenCalled();
    });
  });

  describe('e-mails de ciclo de vida (T-135x)', () => {
    const NOW = new Date('2026-07-27T10:00:00Z');
    const verificado = [{ id: 'u1', name: 'Fulano', email: 'a@b.com' }];

    it('trial acabando: manda no D-3 e registra o estágio', async () => {
      assinaturas.trialsExpirandoAte.mockResolvedValue([
        { userId: 'u1', trialEndsAt: new Date('2026-07-30T10:00:00Z') }, // 3 dias
      ]);
      users.find.mockResolvedValue(verificado);
      expect(await service.enviarTrialAcabando(NOW)).toBe(1);
      expect(mail.sendMail.mock.calls[0][0].subject).toContain('em 3 dias');
      expect(insertValues).toHaveBeenCalledWith({
        userId: 'u1',
        alertaId: 'trial_fim:d3',
        canal: 'email',
      });
    });

    it('trial acabando: D-2 não manda (só D-3/D-1/D-0)', async () => {
      assinaturas.trialsExpirandoAte.mockResolvedValue([
        { userId: 'u1', trialEndsAt: new Date('2026-07-29T10:00:00Z') }, // 2 dias
      ]);
      users.find.mockResolvedValue(verificado);
      expect(await service.enviarTrialAcabando(NOW)).toBe(0);
      expect(mail.sendMail).not.toHaveBeenCalled();
    });

    it('trial acabando: usuário não verificado não recebe', async () => {
      assinaturas.trialsExpirandoAte.mockResolvedValue([
        { userId: 'u1', trialEndsAt: new Date('2026-07-30T10:00:00Z') },
      ]);
      users.find.mockResolvedValue([]); // nenhum verificado
      expect(await service.enviarTrialAcabando(NOW)).toBe(0);
    });

    it('trial acabando: já enviado no estágio → pula (dedup)', async () => {
      assinaturas.trialsExpirandoAte.mockResolvedValue([
        { userId: 'u1', trialEndsAt: new Date('2026-07-30T10:00:00Z') },
      ]);
      users.find.mockResolvedValue(verificado);
      log.findOne.mockResolvedValue({ alertaId: 'trial_fim:d3' });
      expect(await service.enviarTrialAcabando(NOW)).toBe(0);
    });

    it('complete perfil: manda para conta verificada SEM docs', async () => {
      users.find.mockResolvedValue(verificado);
      companyProfile.temDocumentos.mockResolvedValue(false);
      expect(await service.enviarCompletePerfil(NOW)).toBe(1);
      expect(mail.sendMail.mock.calls[0][0].subject).toContain(
        'Complete seu perfil',
      );
    });

    it('complete perfil: se já tem docs, não manda', async () => {
      users.find.mockResolvedValue(verificado);
      companyProfile.temDocumentos.mockResolvedValue(true);
      expect(await service.enviarCompletePerfil(NOW)).toBe(0);
      expect(mail.sendMail).not.toHaveBeenCalled();
    });

    it('dunning: manda em past_due, dedup pelo episódio', async () => {
      assinaturas.emPastDue.mockResolvedValue([
        { userId: 'u1', pastDueDesde: new Date('2026-07-25T00:00:00Z') },
      ]);
      users.find.mockResolvedValue(verificado);
      expect(await service.enviarDunning(NOW)).toBe(1);
      expect(insertValues).toHaveBeenCalledWith({
        userId: 'u1',
        alertaId: 'dunning:2026-07-25',
        canal: 'email',
      });
    });
  });
});

// Aviso de renovação anual (T-158). Existe para evitar CHARGEBACK: cobrança
// anual de surpresa vira disputa, e disputa custa mais que reembolso.
describe('NotificacoesService — renovação anual (T-158)', () => {
  let service: NotificacoesService;
  let users: { find: jest.Mock; findOne: jest.Mock; update: jest.Mock };
  let log: {
    find: jest.Mock;
    findOne: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let mail: { sendMail: jest.Mock };
  let assinaturas: { anuaisRenovandoAte: jest.Mock };
  let billing: { listarPrecos: jest.Mock };
  let insertExecute: jest.Mock;

  const NOW = new Date('2026-07-14T12:00:00Z');
  const FIM = new Date('2026-07-21T12:00:00Z'); // 7 dias à frente

  const assinaturaAnual = (over: Partial<Assinatura> = {}) =>
    ({
      id: 'a1',
      userId: 'u1',
      plano: 'anual',
      currentPeriodEnd: FIM,
      ...over,
    }) as Assinatura;

  const verificado = {
    id: 'u1',
    name: 'Fulano',
    email: 'a@b.com',
    emailVerifiedAt: new Date('2026-01-01T00:00:00Z'),
  };

  beforeEach(() => {
    insertExecute = jest.fn().mockResolvedValue(undefined);
    users = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(verificado),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    log = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      createQueryBuilder: jest.fn(() => ({
        insert: () => ({
          into: () => ({
            values: () => ({ orIgnore: () => ({ execute: insertExecute }) }),
          }),
        }),
      })),
    };
    mail = { sendMail: jest.fn().mockResolvedValue(undefined) };
    assinaturas = {
      anuaisRenovandoAte: jest.fn().mockResolvedValue([assinaturaAnual()]),
    };
    billing = {
      listarPrecos: jest.fn().mockResolvedValue({
        mensal: {
          plano: 'mensal',
          priceId: 'p_m',
          valor: 14_900,
          moeda: 'brl',
        },
        anual: { plano: 'anual', priceId: 'p_a', valor: 149_000, moeda: 'brl' },
        economiaAnual: 29_800,
        mesesGratis: 2,
      }),
    };
    const config = {
      get: jest.fn((_k: string, d: unknown) => d ?? 'https://app.x'),
    };
    service = new NotificacoesService(
      users as unknown as Repository<User>,
      log as unknown as Repository<NotificationLog>,
      { find: jest.fn() } as unknown as Repository<MailLog>,
      { listar: jest.fn() } as unknown as AlertasService,
      mail as unknown as MailService,
      config as unknown as ConfigService,
      {} as unknown as CompanyProfileService,
      {} as unknown as UsersService,
      assinaturas as unknown as AssinaturasService,
      billing as unknown as StripeBillingService,
      {} as unknown as EditaisSearchService,
    );
  });

  it('avisa o assinante anual com o valor VINDO DA STRIPE', async () => {
    const n = await service.enviarAvisosRenovacaoAnual(NOW);

    expect(n).toBe(1);
    const enviado = mail.sendMail.mock.calls[0][0];
    expect(enviado.to).toBe('a@b.com');
    // O valor não pode sair do nosso banco: o e-mail anunciaria um preço e o
    // cartão seria debitado noutro.
    expect(billing.listarPrecos).toHaveBeenCalled();
    expect(enviado.subject).toContain('1.490');
    expect(enviado.subject).toContain('em 7 dias');
  });

  it('não avisa duas vezes o mesmo período', async () => {
    log.findOne.mockResolvedValue({ alertaId: 'já' });

    expect(await service.enviarAvisosRenovacaoAnual(NOW)).toBe(0);
    expect(mail.sendMail).not.toHaveBeenCalled();
  });

  // A chave carrega o fim do período: no ano seguinte a data é outra e a pessoa
  // é avisada de novo. Uma chave só por assinatura avisaria uma vez na vida.
  it('a chave do log inclui o período, não só a assinatura', async () => {
    await service.enviarAvisosRenovacaoAnual(NOW);

    const { where } = log.findOne.mock.calls[0][0] as {
      where: { alertaId: string };
    };
    expect(where.alertaId).toContain('a1');
    expect(where.alertaId).toContain(FIM.toISOString());
  });

  // Dado de cobrança não vai para endereço não confirmado (T-132).
  it('não manda para e-mail não verificado', async () => {
    users.findOne.mockResolvedValue({ ...verificado, emailVerifiedAt: null });

    expect(await service.enviarAvisosRenovacaoAnual(NOW)).toBe(0);
    expect(mail.sendMail).not.toHaveBeenCalled();
  });

  it('assinatura sem data de renovação não gera aviso', async () => {
    assinaturas.anuaisRenovandoAte.mockResolvedValue([
      assinaturaAnual({ currentPeriodEnd: null }),
    ]);

    expect(await service.enviarAvisosRenovacaoAnual(NOW)).toBe(0);
    expect(mail.sendMail).not.toHaveBeenCalled();
  });

  it('ninguém renovando → não chama a Stripe à toa', async () => {
    assinaturas.anuaisRenovandoAte.mockResolvedValue([]);

    expect(await service.enviarAvisosRenovacaoAnual(NOW)).toBe(0);
    expect(billing.listarPrecos).not.toHaveBeenCalled();
  });

  // O @Cron hiberna (§8): o aviso pode sair com menos de 7 dias. O texto tem que
  // dizer a verdade em vez de cravar "7 dias".
  it('o texto acompanha os dias reais quando o cron atrasa', async () => {
    await service.enviarAvisosRenovacaoAnual(
      new Date('2026-07-19T12:00:00Z'), // 2 dias antes
    );

    expect(mail.sendMail.mock.calls[0][0].subject).toContain('em 2 dias');
  });

  // E-mail de cobrança com valor errado é pior que e-mail nenhum.
  it('Stripe fora → não manda nada (não inventa preço)', async () => {
    billing.listarPrecos.mockRejectedValue(new Error('stripe fora'));

    await expect(service.enviarAvisosRenovacaoAnual(NOW)).rejects.toThrow();
    expect(mail.sendMail).not.toHaveBeenCalled();
  });
});
