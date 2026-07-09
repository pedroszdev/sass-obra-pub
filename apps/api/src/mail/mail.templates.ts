// Templates de e-mail de marca (T-101). HTML "email-safe": tabelas + estilos
// inline (Gmail/Outlook ignoram <style> e classes). Layout reusável para os
// próximos e-mails transacionais (reset agora; T-132/T-103 depois).

const AMBAR = '#C25A26';
const GRAFITE = '#211F1C';
const CONCRETO = '#ECE7DF';
const CINZA = '#676563';

// Wordmark PrumoLicita (texto — nada de imagem externa, que o cliente bloqueia).
const wordmark = `<span style="color:${GRAFITE};font-weight:800;">Prumo</span><span style="color:${AMBAR};font-weight:800;">Licita</span>`;

// Casca da marca. `corpo` é o HTML do miolo (já formatado). `preheader` é o
// texto de prévia (aparece na caixa de entrada, escondido no corpo).
export function layoutEmail(opts: {
  preheader: string;
  corpo: string;
}): string {
  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:${CONCRETO};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${opts.preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CONCRETO};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">
        <tr><td style="padding:8px 4px 20px;font-size:20px;letter-spacing:-0.01em;">${wordmark}</td></tr>
        <tr><td style="background:#ffffff;border:1px solid #DED9D2;border-radius:14px;padding:36px 36px 32px;">
          ${opts.corpo}
        </td></tr>
        <tr><td style="padding:20px 4px;color:${CINZA};font-size:12px;line-height:1.6;">
          Você recebeu este e-mail porque tem uma conta no PrumoLicita — a plataforma de licitações de obra pública.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// Botão âmbar "bulletproof-ish" (padding no <a>; funciona bem em Gmail/Outlook).
function botao(href: string, texto: string): string {
  return `<a href="${href}" target="_blank" style="display:inline-block;background:${AMBAR};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 30px;border-radius:8px;">${texto}</a>`;
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
  valorLabel: string | null; // já formatado (ex.: "R$ 1,2 mi") ou null
}

// E-mail "Melhor obra pra você hoje" (T-135): 1 obra APTA nova da região.
export function emailObraDoDia(
  nome: string,
  obra: ObraDoDia,
  url: string,
): MailTemplate {
  const valor = obra.valorLabel
    ? `<div style="font-size:13px;color:${CINZA};margin-top:6px;">Valor estimado: <strong style="color:${GRAFITE};">${obra.valorLabel}</strong></div>`
    : '';
  const corpo = `
    <div style="font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${AMBAR};">Melhor obra pra você hoje</div>
    <h1 style="margin:6px 0 4px;font-size:20px;line-height:1.35;color:${GRAFITE};">${obra.objeto}</h1>
    <div style="font-size:13.5px;color:${CINZA};">${obra.orgaoNome} · ${obra.municipioNome}/${obra.uf}</div>
    <div style="display:inline-block;margin-top:10px;background:#EEF4F1;color:#2F7A55;font-size:12px;font-weight:600;padding:4px 10px;border-radius:6px;">✓ Você está apto para esta obra</div>
    ${valor}
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 4px;"><tr><td>${botao(url, 'Ver o edital')}</td></tr></table>
    <p style="margin:18px 0 0;font-size:12px;line-height:1.6;color:${CINZA};">Você recebe no máximo uma obra por dia. Para ajustar, gerencie as notificações no seu perfil.</p>`;
  return {
    subject: `Obra pra você hoje: ${obra.objeto.slice(0, 60)}`,
    html: layoutEmail({
      preheader: `Uma obra apta na sua região: ${obra.objeto}`,
      corpo,
    }),
    text: `Melhor obra pra você hoje (você está apto):\n\n${obra.objeto}\n${obra.orgaoNome} · ${obra.municipioNome}/${obra.uf}\n${obra.valorLabel ? `Valor estimado: ${obra.valorLabel}\n` : ''}\nVer o edital: ${url}\n\nPrumoLicita`,
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
    <tr><td style="padding:12px 0;border-bottom:1px solid #F1EEE8;">
      <a href="${i.url}" target="_blank" style="text-decoration:none;">
        <div style="font-size:14px;font-weight:600;color:${GRAFITE};">${i.titulo}</div>
        <div style="font-size:13px;color:${CINZA};margin-top:2px;">${i.detalhe}</div>
      </a>
    </td></tr>`,
    )
    .join('');
  const plural = itens.length === 1 ? 'item precisa' : 'itens precisam';
  const corpo = `
    <h1 style="margin:0 0 8px;font-size:22px;line-height:1.3;color:${GRAFITE};letter-spacing:-0.01em;">Precisa da sua atenção</h1>
    <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#4F4E4B;">Olá, ${nome}. ${itens.length} ${plural} de atenção no seu PrumoLicita:</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">${linhas}</table>
    <table role="presentation" cellpadding="0" cellspacing="0"><tr><td>${botao(appUrl, 'Abrir o PrumoLicita')}</td></tr></table>`;
  return {
    subject:
      itens.length === 1
        ? `${itens[0].titulo} — PrumoLicita`
        : `${itens.length} itens precisam da sua atenção — PrumoLicita`,
    html: layoutEmail({
      preheader: `${itens.length} ${plural} de atenção no PrumoLicita.`,
      corpo,
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
    <h1 style="margin:0 0 8px;font-size:22px;line-height:1.3;color:${GRAFITE};letter-spacing:-0.01em;">Confirme seu e-mail</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#4F4E4B;">Olá, ${nome}. Falta só um passo para liberar o PrumoLicita: confirme que este e-mail é seu clicando no botão abaixo. O link vale <strong>24 horas</strong>.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 24px;"><tr><td>${botao(link, 'Confirmar meu e-mail')}</td></tr></table>
    <p style="margin:0 0 6px;font-size:13px;line-height:1.6;color:${CINZA};">Se o botão não funcionar, copie e cole este endereço no navegador:</p>
    <p style="margin:0 0 22px;font-size:12px;line-height:1.5;word-break:break-all;"><a href="${link}" target="_blank" style="color:${AMBAR};">${link}</a></p>
    <hr style="border:none;border-top:1px solid #ECE7DF;margin:0 0 18px;">
    <p style="margin:0;font-size:13px;line-height:1.6;color:${CINZA};">Se não foi você que criou uma conta, ignore este e-mail.</p>`;
  return {
    subject: 'Confirme seu e-mail — PrumoLicita',
    html: layoutEmail({
      preheader: 'Confirme seu e-mail para liberar o PrumoLicita.',
      corpo,
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
    <h1 style="margin:0 0 8px;font-size:22px;line-height:1.3;color:${GRAFITE};letter-spacing:-0.01em;">Redefinição de senha</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#4F4E4B;">Olá, ${nome}. Recebemos um pedido para redefinir a senha da sua conta. Clique no botão abaixo para criar uma nova — o link vale <strong>1 hora</strong>.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 24px;"><tr><td>${botao(link, 'Redefinir minha senha')}</td></tr></table>
    <p style="margin:0 0 6px;font-size:13px;line-height:1.6;color:${CINZA};">Se o botão não funcionar, copie e cole este endereço no navegador:</p>
    <p style="margin:0 0 22px;font-size:12px;line-height:1.5;word-break:break-all;"><a href="${link}" target="_blank" style="color:${AMBAR};">${link}</a></p>
    <hr style="border:none;border-top:1px solid #ECE7DF;margin:0 0 18px;">
    <p style="margin:0;font-size:13px;line-height:1.6;color:${CINZA};">Se não foi você que pediu, ignore este e-mail — sua senha continua a mesma.</p>`;
  return {
    subject: 'Redefinição de senha — PrumoLicita',
    html: layoutEmail({
      preheader: 'Link para criar uma nova senha (válido por 1 hora).',
      corpo,
    }),
    text: `Olá, ${nome}.\n\nRecebemos um pedido para redefinir sua senha. Abra o link abaixo (válido por 1 hora) para criar uma nova:\n\n${link}\n\nSe não foi você, ignore este e-mail — sua senha continua a mesma.\n\nPrumoLicita`,
  };
}
