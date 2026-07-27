import {
  emailBoasVindas,
  emailNotificacoes,
  emailObrasDaRegiao,
  emailRedefinicaoSenha,
  emailVerificacao,
  esc,
} from '../src/mail/mail.templates';

// O HTML dos e-mails é montado por interpolação de template string, então todo
// dado que não é literal do arquivo precisa ser escapado: o `nome` vem do
// cadastro (campo livre) e objeto/órgão/município vêm do PNCP (terceiro). Sem
// escape, uma tag no meio do nome vira marcação de verdade no e-mail.
const NOME_HOSTIL = '<img src=x onerror=alert(1)>Zé';
const ESCAPADO = '&lt;img src=x onerror=alert(1)&gt;Zé';

describe('esc', () => {
  it('escapa os cinco caracteres que quebram HTML', () => {
    expect(esc(`<a href="x" title='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;',
    );
  });

  it('não mexe em texto comum (acentos preservados)', () => {
    expect(esc('Construtora Ipê Ltda')).toBe('Construtora Ipê Ltda');
  });
});

describe('templates: nome do usuário não vira marcação', () => {
  it('boas-vindas', () => {
    const { html } = emailBoasVindas(NOME_HOSTIL, 'Santa Catarina', 'http://x');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain(ESCAPADO);
  });

  it('verificação de e-mail', () => {
    const { html } = emailVerificacao(NOME_HOSTIL, 'http://x/verificar');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain(ESCAPADO);
  });

  it('redefinição de senha', () => {
    const { html } = emailRedefinicaoSenha(NOME_HOSTIL, 'http://x/redefinir');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain(ESCAPADO);
  });

  it('resumo de notificações (título e detalhe do alerta também)', () => {
    const { html } = emailNotificacoes(
      NOME_HOSTIL,
      [
        {
          titulo: '<b>CND</b> vencida',
          detalhe: '<script>x</script>',
          url: 'http://x/documentos',
        },
      ],
      'http://x',
    );
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;b&gt;CND&lt;/b&gt; vencida');
  });
});

describe('obras da região: o texto do PNCP não vira marcação', () => {
  const obra = {
    objeto: 'Reforma <script>alert(1)</script> de escola',
    orgaoNome: 'Prefeitura & Cia',
    municipioNome: 'Içara',
    uf: 'SC',
    modalidadeNome: '<i>Concorrência</i>',
    valorLabel: 'R$ 1,2 mi',
    prazoLabel: 'em 14 dias',
    sessaoLabel: '23/07 09:00',
    href: 'http://x/editais/1',
  };

  it('escapa objeto, órgão e modalidade (manchete apta)', () => {
    const { html } = emailObrasDaRegiao('Ana', {
      apto: true,
      headline: obra,
      outras: [],
      perfilHref: 'http://x/perfil',
    });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<i>Concorrência</i>');
    expect(html).toContain('Prefeitura &amp; Cia');
    expect(html).toContain('Você está apto');
  });

  it('sem apto: mostra o CTA de completar perfil, sem o selo', () => {
    const { html } = emailObrasDaRegiao('Ana', {
      apto: false,
      headline: obra,
      outras: [{ ...obra, objeto: 'Outra obra', href: 'http://x/editais/2' }],
      perfilHref: 'http://x/perfil',
    });
    expect(html).not.toContain('&#10003;'); // sem o selo verde de "apto"
    expect(html).toContain('Completar meu perfil');
    expect(html).toContain('http://x/perfil');
    expect(html).toContain('Outra obra'); // a lista de outras aparece
  });

  it('região sem obra: manda mesmo assim, com o nudge', () => {
    const { html, text } = emailObrasDaRegiao('Ana', {
      apto: false,
      headline: null,
      outras: [],
      perfilHref: 'http://x/perfil',
    });
    expect(html).toContain('Nenhuma obra aberta');
    expect(text).toContain('Nenhuma obra aberta');
  });

  it('a versão em texto puro segue crua', () => {
    const { text } = emailObrasDaRegiao('Ana', {
      apto: true,
      headline: obra,
      outras: [],
      perfilHref: 'http://x/perfil',
    });
    expect(text).toContain('Prefeitura & Cia');
  });
});
