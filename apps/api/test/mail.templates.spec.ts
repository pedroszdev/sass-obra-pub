import {
  emailBoasVindas,
  emailNotificacoes,
  emailObraDoDia,
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

describe('obra do dia: o texto do PNCP não vira marcação', () => {
  const obra = {
    objeto: 'Reforma <script>alert(1)</script> de escola',
    orgaoNome: 'Prefeitura & Cia',
    municipioNome: 'Içara',
    uf: 'SC',
    modalidadeNome: '<i>Concorrência</i>',
    valorLabel: 'R$ 1,2 mi',
    prazoLabel: 'em 14 dias',
    sessaoLabel: '23/07 09:00',
  };

  it('escapa objeto, órgão e modalidade vindos da fonte externa', () => {
    const { html } = emailObraDoDia('Ana', obra, 'http://x/editais/1');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<i>Concorrência</i>');
    expect(html).toContain('Prefeitura &amp; Cia');
    expect(html).toContain('Içara');
  });

  // O corpo em texto puro NÃO é HTML: escapar ali só encheria o e-mail de
  // &amp; para o usuário ler.
  it('a versão em texto puro segue crua', () => {
    const { text } = emailObraDoDia('Ana', obra, 'http://x/editais/1');
    expect(text).toContain('Prefeitura & Cia');
  });
});
