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
