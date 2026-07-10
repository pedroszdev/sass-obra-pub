// Templates de e-mail de marca (T-101). HTML "email-safe": tabelas + estilos
// inline (Gmail/Outlook ignoram <style>, classes e flex/gap). O design de origem
// (pasta /emails) usa flexbox; aqui traduzimos para tabelas mantendo o visual:
// topo grafite com o logo, corpo branco colado e rodapé concreto com links.

const AMBAR = '#C25A26';
const AMBAR_CLARO = '#D08058';
const AMBAR_ESCURO = '#A14A1E';
const GRAFITE = '#211F1C';
const CONCRETO = '#ECE7DF';
const CINZA = '#676563';
const CINZA_CLARO = '#A5A29C';
const TEXTO = '#4F4E4B';
const BORDA = '#DED9D2';
const BORDA_LEVE = '#F1EEE8';
const ACO = '#64747E';

// Stacks de fonte: as fontes da marca (Archivo/IBM Plex) caem para as do sistema
// nos clientes que não carregam webfont — o peso e o tamanho preservam o tom.
const SANS =
  "'IBM Plex Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const HEAD = "'Archivo'," + SANS;
const MONO =
  "'IBM Plex Mono',ui-monospace,'SFMono-Regular',Menlo,Consolas,monospace";

// Marca do topo: o fio de prumo (bolinha + linha + bob em losango de dois tons)
// + wordmark. SVG não é confiável em e-mail (Gmail remove, Outlook não desenha),
// então o bob é montado com triângulos de borda CSS — suportados em toda parte.
// `font-size:0;line-height:0` no <td> mata os espaços entre as divs empilhadas.
const logoMark = `
  <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><tr>
    <td style="vertical-align:middle;padding-right:11px;font-size:0;line-height:0;">
      <div style="width:4px;height:4px;border-radius:50%;background:${CONCRETO};margin:0 auto 2px;"></div>
      <div style="width:2px;height:8px;background:${CONCRETO};margin:0 auto 1px;"></div>
      <div style="width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-bottom:8px solid ${AMBAR};margin:0 auto;"></div>
      <div style="width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-top:11px solid ${AMBAR_ESCURO};margin:0 auto;"></div>
    </td>
    <td style="vertical-align:middle;font-family:${HEAD};font-size:18px;font-weight:800;letter-spacing:-0.02em;color:${CONCRETO};">Prumo<span style="color:${AMBAR_CLARO};">Licita</span></td>
  </tr></table>`;

// Selo de urgência (pílula clara sobre o grafite do topo).
function seloTopo(texto: string): string {
  return `<span style="display:inline-block;font-family:${SANS};font-size:11px;font-weight:700;padding:4px 12px;border-radius:99px;background:rgba(146,59,32,0.35);color:#E8B7A5;border:1px solid rgba(232,183,165,0.3);">${texto}</span>`;
}

// Casca da marca. `corpo` é o HTML do miolo. `headerRight` é o slot à direita do
// logo (selo/data). `footer` é o HTML do rodapé (segurança vs. marketing).
export function layoutEmail(opts: {
  preheader: string;
  corpo: string;
  headerRight?: string;
  footer: string;
}): string {
  const right = opts.headerRight
    ? `<td align="right" style="vertical-align:middle;">${opts.headerRight}</td>`
    : '';
  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:${CONCRETO};font-family:${SANS};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${opts.preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CONCRETO};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background:${GRAFITE};border-radius:14px 14px 0 0;padding:24px 36px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="vertical-align:middle;">${logoMark}</td>
            ${right}
          </tr></table>
        </td></tr>
        <tr><td style="background:#ffffff;padding:40px 36px;">
          ${opts.corpo}
        </td></tr>
        <tr><td style="background:${CONCRETO};border-top:1px solid ${BORDA};border-radius:0 0 14px 14px;padding:20px 36px;">
          ${opts.footer}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// Botão âmbar de largura total (padding no <a>; robusto em Gmail/Outlook).
function botao(href: string, texto: string): string {
  return `<a href="${href}" target="_blank" style="display:block;background:${AMBAR};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;text-align:center;padding:15px 24px;border-radius:10px;font-family:${SANS};">${texto}</a>`;
}

// Rótulo mono maiúsculo de seção (ex.: "COMECE POR AQUI").
function rotulo(texto: string): string {
  return `<div style="font-family:${MONO};font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:${ACO};">${texto}</div>`;
}

// Rodapés (dois tons): segurança (verificação/senha) e marketing (com links).
function rodapeSeguranca(): string {
  return `<div style="font-family:${SANS};font-size:12px;color:${CINZA_CLARO};line-height:1.5;">E-mail automático de segurança da PrumoLicita — não é possível respondê-lo. <a href="#" style="color:${CINZA};">Precisa de ajuda?</a></div>`;
}

function rodapeMarketing(motivo: string): string {
  return `<div style="font-family:${SANS};font-size:12px;color:${CINZA_CLARO};line-height:1.5;">${motivo}</div>
    <div style="font-family:${SANS};font-size:12px;color:${CINZA_CLARO};margin-top:6px;"><a href="#" style="color:${CINZA};">Preferências de e-mail</a> · <a href="#" style="color:${CINZA};">Ajuda</a></div>`;
}

export interface MailTemplate {
  subject: string;
  html: string;
  text: string;
}

export interface NotificacaoItem {
  titulo: string;
  detalhe: string;
  /** URL absoluta (já com o WEB_ORIGIN) para onde o item leva. */
  url: string;
}

export interface ObraDoDia {
  objeto: string;
  orgaoNome: string;
  municipioNome: string;
  uf: string;
  modalidadeNome?: string | null;
  valorLabel: string | null; // já formatado (ex.: "R$ 1,2 mi") ou null
  /** Ex.: "em 14 dias" — quando há prazo de proposta. Opcional. */
  prazoLabel?: string | null;
  /** Ex.: "23/07 09:00" — data/hora da sessão. Opcional. */
  sessaoLabel?: string | null;
}

// E-mail de boas-vindas (conta confirmada): apresenta o produto e os 1º passos.
export function emailBoasVindas(
  nome: string,
  ufNome: string,
  appUrl: string,
): MailTemplate {
  const passo = (n: number, titulo: string, texto: string) => `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;"><tr>
      <td style="width:26px;vertical-align:top;">
        <div style="width:26px;height:26px;border-radius:50%;background:${GRAFITE};color:${CONCRETO};text-align:center;line-height:26px;font-family:${MONO};font-size:13px;font-weight:600;">${n}</div>
      </td>
      <td style="padding-left:14px;font-family:${SANS};font-size:14.5px;line-height:1.55;color:${TEXTO};"><strong style="color:${GRAFITE};font-weight:600;">${titulo}</strong> ${texto}</td>
    </tr></table>`;
  const corpo = `
    <h1 style="margin:0 0 10px;font-family:${HEAD};font-size:26px;font-weight:800;letter-spacing:-0.02em;color:${GRAFITE};line-height:1.2;">Bem-vindo, ${nome}.<br>Sua região já está sendo monitorada.</h1>
    <p style="margin:0 0 24px;font-family:${SANS};font-size:15px;line-height:1.6;color:${CINZA};">A partir de agora a gente vasculha os portais públicos por você. Toda obra nova de <strong style="color:${GRAFITE};font-weight:600;">${ufNome}</strong> que combinar com seu perfil aparece no seu painel — e a melhor delas chega aqui no seu e-mail, uma por dia.</p>
    ${rotulo('Comece por aqui')}
    ${passo(1, 'Envie suas certidões e atestados.', 'É com eles que dizemos, edital por edital, se você está apto a participar.')}
    ${passo(2, 'Salve as obras que interessam.', 'A gente monta a agenda de prazos e avisa antes de encerrar.')}
    ${passo(3, 'Monte a proposta na plataforma.', 'Planilha importada do edital, BDI, cronograma e exportação em PDF.')}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:26px 0 12px;"><tr><td>${botao(appUrl, 'Ver obras da minha região')}</td></tr></table>
    <div style="font-family:${SANS};font-size:13px;color:${CINZA_CLARO};text-align:center;">Leva 2 minutos pra completar o perfil — e desbloqueia o diagnóstico de aptidão.</div>`;
  return {
    subject: 'Bem-vindo ao PrumoLicita',
    html: layoutEmail({
      preheader: `Sua região (${ufNome}) já está sendo monitorada. Comece pelos primeiros passos.`,
      corpo,
      footer: rodapeMarketing(
        'Você recebe este e-mail porque criou uma conta na PrumoLicita.',
      ),
    }),
    text: `Bem-vindo, ${nome}.\n\nSua região (${ufNome}) já está sendo monitorada. Toda obra nova que combinar com seu perfil aparece no seu painel.\n\nComece por aqui:\n1. Envie suas certidões e atestados — é com eles que dizemos se você está apto a cada edital.\n2. Salve as obras que interessam — montamos a agenda de prazos.\n3. Monte a proposta na plataforma — planilha do edital, BDI, cronograma e PDF.\n\nVer obras da minha região: ${appUrl}\n\nPrumoLicita`,
  };
}

// E-mail "Melhor obra pra você hoje" (T-135): 1 obra APTA nova da região.
export function emailObraDoDia(
  nome: string,
  obra: ObraDoDia,
  url: string,
): MailTemplate {
  // Métricas do card escuro (valor / prazo / sessão) — só as que existirem.
  const metrica = (label: string, valor: string, cor = CONCRETO) => `
    <td style="padding-right:22px;vertical-align:top;">
      <div style="font-family:${MONO};font-size:10px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#959493;">${label}</div>
      <div style="font-family:${MONO};font-size:18px;font-weight:600;color:${cor};margin-top:2px;white-space:nowrap;">${valor}</div>
    </td>`;
  const metricas = [
    obra.valorLabel ? metrica('Valor estimado', obra.valorLabel) : '',
    obra.prazoLabel
      ? metrica('Proposta encerra', obra.prazoLabel, AMBAR_CLARO)
      : '',
    obra.sessaoLabel ? metrica('Sessão', obra.sessaoLabel) : '',
  ].join('');
  const barraMetricas = metricas
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:16px;padding-top:16px;border-top:1px solid rgba(236,231,223,0.12);width:100%;"><tr>${metricas}</tr></table>`
    : '';
  const modalidade = obra.modalidadeNome
    ? `<span style="font-family:${MONO};font-size:11.5px;color:#959493;padding-left:10px;">${obra.modalidadeNome}</span>`
    : '';
  const corpo = `
    ${rotulo('Melhor obra pra você hoje')}
    <p style="margin:8px 0 24px;font-family:${SANS};font-size:14.5px;line-height:1.55;color:${CINZA};">Esta é a obra nova da sua região que melhor combina com seu perfil:</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${GRAFITE};border-radius:14px;"><tr><td style="padding:28px;">
      <div><span style="display:inline-block;font-family:${SANS};font-size:11px;font-weight:700;padding:3px 10px;border-radius:99px;background:rgba(119,168,144,0.18);color:#77A890;border:1px solid rgba(119,168,144,0.35);">&#10003; Você está apto</span>${modalidade}</div>
      <div style="font-family:${HEAD};font-size:22px;font-weight:800;letter-spacing:-0.01em;line-height:1.2;color:${CONCRETO};margin-top:16px;">${obra.objeto}</div>
      <div style="font-family:${SANS};font-size:13.5px;color:rgba(236,231,223,0.65);margin-top:4px;">${obra.orgaoNome} · ${obra.municipioNome}/${obra.uf}</div>
      ${barraMetricas}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;"><tr><td>${botao(url, 'Ver resumo do edital')}</td></tr></table>
    </td></tr></table>
    <p style="margin:22px 0 0;font-family:${SANS};font-size:12px;line-height:1.6;color:${CINZA_CLARO};">Você recebe no máximo uma obra por dia. Para ajustar, gerencie as notificações no seu perfil.</p>`;
  return {
    subject: `Obra pra você hoje: ${obra.objeto.slice(0, 60)}`,
    html: layoutEmail({
      preheader: `Uma obra apta na sua região: ${obra.objeto}`,
      corpo,
      footer: rodapeMarketing(
        'Você recebe este e-mail porque ativou a "melhor obra do dia" no seu perfil.',
      ),
    }),
    text: `Melhor obra pra você hoje (você está apto):\n\n${obra.objeto}\n${obra.orgaoNome} · ${obra.municipioNome}/${obra.uf}\n${obra.valorLabel ? `Valor estimado: ${obra.valorLabel}\n` : ''}${obra.prazoLabel ? `Proposta encerra: ${obra.prazoLabel}\n` : ''}\nVer o edital: ${url}\n\nPrumoLicita`,
  };
}

// E-mail-resumo de notificações acionáveis (T-103): certidões vencendo/vencidas
// e prazos de entrega próximos.
export function emailNotificacoes(
  nome: string,
  itens: NotificacaoItem[],
  appUrl: string,
): MailTemplate {
  const linhas = itens
    .map(
      (i) => `
    <tr><td style="padding:14px 0;border-bottom:1px solid ${BORDA_LEVE};">
      <a href="${i.url}" target="_blank" style="text-decoration:none;">
        <div style="font-family:${SANS};font-size:14.5px;font-weight:600;color:${GRAFITE};">${i.titulo}</div>
        <div style="font-family:${SANS};font-size:13px;color:${CINZA};margin-top:2px;">${i.detalhe}</div>
      </a>
    </td></tr>`,
    )
    .join('');
  const plural = itens.length === 1 ? 'item precisa' : 'itens precisam';
  const corpo = `
    <h1 style="margin:0 0 8px;font-family:${HEAD};font-size:24px;font-weight:800;line-height:1.25;color:${GRAFITE};letter-spacing:-0.02em;">Precisa da sua atenção</h1>
    <p style="margin:0 0 18px;font-family:${SANS};font-size:15px;line-height:1.6;color:${TEXTO};">Olá, ${nome}. ${itens.length} ${plural} de atenção no seu PrumoLicita:</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">${linhas}</table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td>${botao(appUrl, 'Abrir o PrumoLicita')}</td></tr></table>`;
  return {
    subject:
      itens.length === 1
        ? `${itens[0].titulo} — PrumoLicita`
        : `${itens.length} itens precisam da sua atenção — PrumoLicita`,
    html: layoutEmail({
      preheader: `${itens.length} ${plural} de atenção no PrumoLicita.`,
      corpo,
      headerRight: seloTopo('Ação necessária'),
      footer: rodapeMarketing(
        'Alerta de urgência da PrumoLicita — enviado só quando algo seu precisa de ação.',
      ),
    }),
    text:
      `Olá, ${nome}. Precisa da sua atenção no PrumoLicita:\n\n` +
      itens.map((i) => `• ${i.titulo} — ${i.detalhe}\n  ${i.url}`).join('\n') +
      `\n\nAbrir: ${appUrl}\n\nPrumoLicita`,
  };
}

// E-mail de verificação de conta (T-132).
export function emailVerificacao(nome: string, link: string): MailTemplate {
  const corpo = `
    <h1 style="margin:0 0 10px;font-family:${HEAD};font-size:24px;font-weight:800;letter-spacing:-0.02em;color:${GRAFITE};">Confirme seu e-mail</h1>
    <p style="margin:0 0 24px;font-family:${SANS};font-size:15px;line-height:1.6;color:${CINZA};">Olá, ${nome}. Falta um passo: confirme que este e-mail é seu pra ativar a conta e começar a receber as obras da sua região.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;"><tr><td>${botao(link, 'Confirmar e-mail')}</td></tr></table>
    <p style="margin:0 0 6px;font-family:${SANS};font-size:13px;line-height:1.6;color:${CINZA};">Se o botão não funcionar, copie e cole este endereço no navegador:</p>
    <p style="margin:0 0 22px;font-family:${SANS};font-size:12px;line-height:1.5;word-break:break-all;"><a href="${link}" target="_blank" style="color:${AMBAR};">${link}</a></p>
    <div style="border-top:1px solid ${BORDA_LEVE};padding-top:18px;font-family:${SANS};font-size:13px;line-height:1.6;color:${CINZA_CLARO};">O link vale por <strong style="color:${CINZA};font-weight:600;">24 horas</strong>. Se não foi você que criou esta conta, pode ignorar este e-mail — nada será ativado.</div>`;
  return {
    subject: 'Confirme seu e-mail — PrumoLicita',
    html: layoutEmail({
      preheader: 'Confirme seu e-mail para liberar o PrumoLicita.',
      corpo,
      footer: rodapeSeguranca(),
    }),
    text: `Olá, ${nome}.\n\nConfirme seu e-mail para liberar o PrumoLicita (link válido por 24h):\n\n${link}\n\nSe não foi você, ignore este e-mail.\n\nPrumoLicita`,
  };
}

// E-mail de redefinição de senha (T-101).
export function emailRedefinicaoSenha(
  nome: string,
  link: string,
): MailTemplate {
  const corpo = `
    <h1 style="margin:0 0 10px;font-family:${HEAD};font-size:24px;font-weight:800;letter-spacing:-0.02em;color:${GRAFITE};">Redefinir sua senha</h1>
    <p style="margin:0 0 22px;font-family:${SANS};font-size:15px;line-height:1.6;color:${CINZA};">Olá, ${nome}. Recebemos um pedido pra trocar a senha da sua conta. Se foi você, é só continuar — o link vale <strong style="color:${GRAFITE};font-weight:600;">1 hora</strong> e só funciona uma vez.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;"><tr><td>${botao(link, 'Criar nova senha')}</td></tr></table>
    <p style="margin:0 0 6px;font-family:${SANS};font-size:13px;line-height:1.6;color:${CINZA};">Se o botão não funcionar, copie e cole este endereço no navegador:</p>
    <p style="margin:0 0 22px;font-family:${SANS};font-size:12px;line-height:1.5;word-break:break-all;"><a href="${link}" target="_blank" style="color:${AMBAR};">${link}</a></p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CONCRETO};border-radius:12px;"><tr>
      <td style="width:30px;padding:16px 0 16px 20px;vertical-align:top;"><div style="width:30px;height:30px;border-radius:50%;background:${ACO};color:${CONCRETO};text-align:center;line-height:30px;font-weight:700;font-size:14px;">?</div></td>
      <td style="padding:16px 20px 16px 12px;font-family:${SANS};font-size:13.5px;line-height:1.55;color:${TEXTO};"><strong style="font-weight:700;">Não pediu essa troca?</strong> Ignore este e-mail — sua senha continua a mesma.</td>
    </tr></table>`;
  return {
    subject: 'Redefinição de senha — PrumoLicita',
    html: layoutEmail({
      preheader: 'Link para criar uma nova senha (válido por 1 hora).',
      corpo,
      footer: rodapeSeguranca(),
    }),
    text: `Olá, ${nome}.\n\nRecebemos um pedido para redefinir sua senha. Abra o link abaixo (válido por 1 hora, uso único) para criar uma nova:\n\n${link}\n\nSe não foi você, ignore este e-mail — sua senha continua a mesma.\n\nPrumoLicita`,
  };
}
