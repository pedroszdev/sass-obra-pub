import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { AlertasService } from '../src/alertas/alertas.service';
import { AlertaItem } from '../src/alertas/alertas.types';
import { Assinatura } from '../src/assinaturas/assinatura.entity';
import { AssinaturasService } from '../src/assinaturas/assinaturas.service';
import { AsaasBillingService } from '../src/assinaturas/asaas-billing.service';
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
    comAssinaturaAsaas: jest.Mock;
  };
  let billing: { listarPrecos: jest.Mock };
  let asaas: { cobrancasAbertasPorAssinatura: jest.Mock };
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
      comAssinaturaAsaas: jest.fn().mockResolvedValue([]),
    };
    // Sem cobrança conhecida, a régua cai no texto de cartão — o padrão
    // histórico. Cada teste que precisa de boleto/Pix sobrescreve.
    asaas = {
      cobrancasAbertasPorAssinatura: jest.fn().mockResolvedValue(new Map()),
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
      asaas as unknown as AsaasBillingService,
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

  // ── T-220: a régua de inadimplência ──
  //
  // 🔴 O que ela corrige não é "faltava e-mail" — é que os e-mails MENTIAM para
  // quem paga por boleto/Pix. Cartão retenta sozinho; cobrança manual não
  // acontece se ninguém pagar. Dizer "vamos tentar de novo automaticamente" a
  // quem tem um boleto parado é prometer um resgate que não existe.
  describe('régua de inadimplência (T-220)', () => {
    const NOW = new Date('2026-07-27T10:00:00Z');
    const verificado = [{ id: 'u1', name: 'Fulano', email: 'a@b.com' }];

    const cobranca = (over: Record<string, unknown> = {}) =>
      new Map([
        [
          'sub_1',
          {
            id: 'pay_1',
            valor: 24_900,
            vencimento: new Date('2026-07-30T03:00:00Z'),
            status: 'PENDING',
            meio: 'UNDEFINED',
            pagarUrl: 'https://asaas/i/1',
            boletoUrl: null,
            comprovanteUrl: null,
            ...over,
          },
        ],
      ]);

    describe('o texto muda com o MEIO', () => {
      it('boleto/Pix: não promete retentativa e manda o link de pagar', async () => {
        assinaturas.emPastDue.mockResolvedValue([
          {
            userId: 'u1',
            pastDueDesde: new Date('2026-07-25T00:00:00Z'),
            asaasSubscriptionId: 'sub_1',
          },
        ]);
        users.find.mockResolvedValue(verificado);
        asaas.cobrancasAbertasPorAssinatura.mockResolvedValue(cobranca());

        expect(await service.enviarDunning(NOW)).toBe(1);
        const enviado = mail.sendMail.mock.calls[0][0];
        expect(enviado.text).not.toMatch(/cart[ãa]o/i);
        // A frase que PROMETE resgate. ⚠️ Não teste por "automaticamente"
        // solto: o texto manual usa a palavra NEGADA ("não é cobrada
        // automaticamente"), que é justamente o que queremos dizer.
        expect(enviado.text).not.toMatch(/vamos tentar de novo/i);
        expect(enviado.text).toContain('https://asaas/i/1');
      });

      it('cartão: mantém o texto de retentativa', async () => {
        assinaturas.emPastDue.mockResolvedValue([
          {
            userId: 'u1',
            pastDueDesde: new Date('2026-07-25T00:00:00Z'),
            asaasSubscriptionId: 'sub_1',
          },
        ]);
        users.find.mockResolvedValue(verificado);
        asaas.cobrancasAbertasPorAssinatura.mockResolvedValue(
          cobranca({ meio: 'CREDIT_CARD' }),
        );

        await service.enviarDunning(NOW);
        expect(mail.sendMail.mock.calls[0][0].text).toMatch(/cart[ãa]o/i);
      });

      // Provedor fora do ar não pode calar a régua: avisar com o texto
      // histórico é melhor que não avisar.
      it('sem dado de cobrança, cai no texto de cartão em vez de silenciar', async () => {
        assinaturas.emPastDue.mockResolvedValue([
          { userId: 'u1', pastDueDesde: new Date('2026-07-25T00:00:00Z') },
        ]);
        users.find.mockResolvedValue(verificado);
        asaas.cobrancasAbertasPorAssinatura.mockRejectedValue(
          new Error('fora'),
        );

        expect(await service.enviarDunning(NOW)).toBe(1);
        expect(mail.sendMail.mock.calls[0][0].text).toMatch(/cart[ãa]o/i);
      });
    });

    describe('aviso PRÉ-vencimento (só cobrança manual)', () => {
      const assinaturaAsaas = [{ userId: 'u1', asaasSubscriptionId: 'sub_1' }];

      it('boleto/Pix vencendo em 3 dias → avisa, com valor e data', async () => {
        assinaturas.comAssinaturaAsaas.mockResolvedValue(assinaturaAsaas);
        users.find.mockResolvedValue(verificado);
        asaas.cobrancasAbertasPorAssinatura.mockResolvedValue(cobranca());

        expect(await service.avisarVencimentoProximo(NOW)).toBe(1);
        const enviado = mail.sendMail.mock.calls[0][0];
        expect(enviado.subject).toContain('249');
        expect(enviado.text).toContain('https://asaas/i/1');
        // Chave pela COBRANÇA: no ciclo seguinte é outra, e avisa de novo.
        expect(insertValues).toHaveBeenCalledWith({
          userId: 'u1',
          alertaId: 'cobranca_vencendo:pay_1',
          canal: 'email',
        });
      });

      // Para cartão seria ruído: a cobrança acontece sozinha.
      it('cartão NÃO recebe aviso de vencimento', async () => {
        assinaturas.comAssinaturaAsaas.mockResolvedValue(assinaturaAsaas);
        users.find.mockResolvedValue(verificado);
        asaas.cobrancasAbertasPorAssinatura.mockResolvedValue(
          cobranca({ meio: 'CREDIT_CARD' }),
        );

        expect(await service.avisarVencimentoProximo(NOW)).toBe(0);
        expect(mail.sendMail).not.toHaveBeenCalled();
      });

      it('fora da janela de 3 dias, não avisa', async () => {
        assinaturas.comAssinaturaAsaas.mockResolvedValue(assinaturaAsaas);
        users.find.mockResolvedValue(verificado);
        asaas.cobrancasAbertasPorAssinatura.mockResolvedValue(
          cobranca({ vencimento: new Date('2026-08-20T03:00:00Z') }),
        );

        expect(await service.avisarVencimentoProximo(NOW)).toBe(0);
      });

      // Depois de vencida quem fala é o dunning — dois e-mails sobre a mesma
      // cobrança no mesmo dia é o caminho para a marcação de spam (T-193).
      it('cobrança já vencida não gera aviso de pré-vencimento', async () => {
        assinaturas.comAssinaturaAsaas.mockResolvedValue(assinaturaAsaas);
        users.find.mockResolvedValue(verificado);
        asaas.cobrancasAbertasPorAssinatura.mockResolvedValue(
          cobranca({ vencimento: new Date('2026-07-20T03:00:00Z') }),
        );

        expect(await service.avisarVencimentoProximo(NOW)).toBe(0);
      });
    });

    // 🔴 O critério literal do backlog: NENHUM cliente é bloqueado sem aviso.
    // Antes disto havia um e-mail no dia 0 e o acesso caía 7 dias depois, em
    // silêncio — a pessoa descobria o corte tentando usar o produto.
    describe('aviso de corte iminente', () => {
      it('avisa 2 dias antes do fim da carência, com a data do corte', async () => {
        // Carência de 7 dias: past_due em 22/07 → corte em 29/07. Hoje é 27.
        assinaturas.emPastDue.mockResolvedValue([
          {
            userId: 'u1',
            pastDueDesde: new Date('2026-07-22T10:00:00Z'),
            asaasSubscriptionId: 'sub_1',
          },
        ]);
        users.find.mockResolvedValue(verificado);

        expect(await service.avisarCorteIminente(NOW)).toBe(1);
        const enviado = mail.sendMail.mock.calls[0][0];
        expect(enviado.text).toContain('29/07/2026');
        expect(insertValues).toHaveBeenCalledWith({
          userId: 'u1',
          alertaId: 'corte_iminente:2026-07-22',
          canal: 'email',
        });
      });

      it('longe do corte, não avisa', async () => {
        assinaturas.emPastDue.mockResolvedValue([
          { userId: 'u1', pastDueDesde: new Date('2026-07-26T10:00:00Z') },
        ]);
        users.find.mockResolvedValue(verificado);

        expect(await service.avisarCorteIminente(NOW)).toBe(0);
      });

      // Depois do corte o aviso não serve para nada — e soaria como deboche.
      it('carência já vencida não gera aviso', async () => {
        assinaturas.emPastDue.mockResolvedValue([
          { userId: 'u1', pastDueDesde: new Date('2026-07-01T10:00:00Z') },
        ]);
        users.find.mockResolvedValue(verificado);

        expect(await service.avisarCorteIminente(NOW)).toBe(0);
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
  let asaas: { listarPrecos: jest.Mock };
  let insertExecute: jest.Mock;
  // Captura o que foi gravado no notification_log — é a chave que garante o
  // "exatamente um e-mail por evento".
  let insertValuesAnual: jest.Mock;

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
    insertValuesAnual = jest.fn(() => ({
      orIgnore: () => ({ execute: insertExecute }),
    }));
    log = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      createQueryBuilder: jest.fn(() => ({
        insert: () => ({ into: () => ({ values: insertValuesAnual }) }),
      })),
    };
    mail = { sendMail: jest.fn().mockResolvedValue(undefined) };
    assinaturas = {
      anuaisRenovandoAte: jest.fn().mockResolvedValue([assinaturaAnual()]),
    };
    // T-222: o preço do Asaas é OUTRO — e é o dele que o assinante do Asaas
    // precisa ver. Antes, todos recebiam o preço da Stripe.
    asaas = {
      listarPrecos: jest.fn().mockResolvedValue({
        mensal: { plano: 'mensal', valor: 24_900, moeda: 'brl' },
        anual: { plano: 'anual', valor: 249_000, moeda: 'brl' },
        economiaAnual: 49_800,
        mesesGratis: 2,
      }),
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
      asaas as unknown as AsaasBillingService,
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
  //
  // ⚠️ Mudança de contrato (T-222): antes a falha derrubava o LOTE inteiro
  // (`rejects.toThrow()`), o que numa base com dois provedores calaria também
  // quem não depende do provedor que caiu. Agora a falha é por assinante: quem
  // não teve preço não recebe, e ninguém recebe valor errado — que é a
  // invariante que de fato importa.
  it('provedor fora → aquele assinante não recebe, e não se inventa preço', async () => {
    billing.listarPrecos.mockRejectedValue(new Error('stripe fora'));

    expect(await service.enviarAvisosRenovacaoAnual(NOW)).toBe(0);
    expect(mail.sendMail).not.toHaveBeenCalled();
  });

  // ── T-222: o preço é do PROVEDOR QUE COBRA A CONTA ──
  //
  // 🔴 Antes, `listarPrecos()` da Stripe valia para todos — então o assinante do
  // Asaas recebia o preço da Stripe e seria debitado noutro. É exatamente o erro
  // que o comentário deste arquivo já advertia, cometido pelo outro eixo.
  it('assinante do Asaas recebe o preço do ASAAS', async () => {
    assinaturas.anuaisRenovandoAte.mockResolvedValue([
      assinaturaAnual({ provider: 'asaas' }),
    ]);

    await service.enviarAvisosRenovacaoAnual(NOW);

    expect(asaas.listarPrecos).toHaveBeenCalled();
    expect(billing.listarPrecos).not.toHaveBeenCalled();
    expect(mail.sendMail.mock.calls[0][0].subject).toContain('2.490');
  });

  // Cobrança manual não renova sozinha — dizer "não precisa fazer nada" a quem
  // paga boleto/Pix é prometer automação que não existe (lição da T-220).
  it('conta do Asaas avisa que a cobrança pode não ser automática', async () => {
    assinaturas.anuaisRenovandoAte.mockResolvedValue([
      assinaturaAnual({ provider: 'asaas' }),
    ]);

    await service.enviarAvisosRenovacaoAnual(NOW);

    const texto = mail.sendMail.mock.calls[0][0].text;
    expect(texto).toMatch(/boleto ou Pix/i);
    expect(texto).not.toMatch(/não precisa fazer nada/i);
  });

  it('conta da Stripe mantém o texto de renovação automática', async () => {
    await service.enviarAvisosRenovacaoAnual(NOW);
    expect(mail.sendMail.mock.calls[0][0].text).toMatch(
      /não precisa fazer nada/i,
    );
  });

  // Um provedor fora não pode calar o outro — era o efeito colateral de ler o
  // preço uma vez, fora do laço.
  it('provedor fora não impede o aviso do outro', async () => {
    billing.listarPrecos.mockRejectedValue(new Error('stripe fora'));
    assinaturas.anuaisRenovandoAte.mockResolvedValue([
      assinaturaAnual({ id: 'a1', userId: 'u1', provider: 'stripe' }),
      assinaturaAnual({ id: 'a2', userId: 'u1', provider: 'asaas' }),
    ]);

    expect(await service.enviarAvisosRenovacaoAnual(NOW)).toBe(1);
    expect(mail.sendMail).toHaveBeenCalledTimes(1);
  });

  // 🔴 O risco que o backlog temia na coexistência. A defesa não é código novo:
  // a chave do `notification_log` é (userId, período), e a base é a NOSSA tabela,
  // com uma linha por conta. Rodar dois provedores não cria um segundo aviso.
  it('não duplica o aviso: a chave é por conta e período', async () => {
    await service.enviarAvisosRenovacaoAnual(NOW);
    const chave = insertValuesAnual.mock.calls[0][0];
    expect(chave.alertaId).toBe(`renovacao_anual:a1:${FIM.toISOString()}`);
    expect(chave.userId).toBe('u1');

    // Segunda passada no mesmo período: o log já tem o registro.
    log.findOne.mockResolvedValue({ alertaId: chave.alertaId });
    mail.sendMail.mockClear();
    expect(await service.enviarAvisosRenovacaoAnual(NOW)).toBe(0);
    expect(mail.sendMail).not.toHaveBeenCalled();
  });
});
