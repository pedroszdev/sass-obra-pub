import { createHmac } from 'node:crypto';
import { verificarAssinaturaResend } from '../src/mail/resend-signature';

// Assinatura do webhook do Resend (Svix), T-193. Se ela deixar passar um corpo
// não assinado, qualquer um forja "entregue"/"bounce" na conta de outro; se
// rejeitar um válido, o status de entrega nunca chega.

const SEGREDO =
  'whsec_' + Buffer.from('chave-secreta-do-svix').toString('base64');
const ID = 'msg_2abc';
const NOW = new Date('2026-07-27T12:00:00Z');
const TS = String(Math.floor(NOW.getTime() / 1000));

function assinar(corpo: Buffer, ts = TS, id = ID, segredo = SEGREDO): string {
  const chave = Buffer.from(segredo.slice(6), 'base64');
  const conteudo = `${id}.${ts}.${corpo.toString('utf8')}`;
  return 'v1,' + createHmac('sha256', chave).update(conteudo).digest('base64');
}

describe('verificarAssinaturaResend (T-193)', () => {
  const corpo = Buffer.from(JSON.stringify({ type: 'email.delivered' }));

  it('assinatura válida → true', () => {
    const sig = assinar(corpo);
    expect(
      verificarAssinaturaResend(
        corpo,
        { id: ID, timestamp: TS, signature: sig },
        SEGREDO,
        NOW,
      ),
    ).toBe(true);
  });

  it('corpo adulterado → false', () => {
    const sig = assinar(corpo);
    const outro = Buffer.from(JSON.stringify({ type: 'email.bounced' }));
    expect(
      verificarAssinaturaResend(
        outro,
        { id: ID, timestamp: TS, signature: sig },
        SEGREDO,
        NOW,
      ),
    ).toBe(false);
  });

  it('segredo errado → false', () => {
    const sig = assinar(
      corpo,
      TS,
      ID,
      'whsec_' + Buffer.from('outra').toString('base64'),
    );
    expect(
      verificarAssinaturaResend(
        corpo,
        { id: ID, timestamp: TS, signature: sig },
        SEGREDO,
        NOW,
      ),
    ).toBe(false);
  });

  it('header ausente → false', () => {
    const sig = assinar(corpo);
    expect(
      verificarAssinaturaResend(
        corpo,
        { id: undefined, timestamp: TS, signature: sig },
        SEGREDO,
        NOW,
      ),
    ).toBe(false);
  });

  it('sem segredo configurado → false', () => {
    const sig = assinar(corpo);
    expect(
      verificarAssinaturaResend(
        corpo,
        { id: ID, timestamp: TS, signature: sig },
        undefined,
        NOW,
      ),
    ).toBe(false);
  });

  it('timestamp fora da tolerância (replay) → false', () => {
    const velho = String(Math.floor(NOW.getTime() / 1000) - 60 * 60);
    const sig = assinar(corpo, velho);
    expect(
      verificarAssinaturaResend(
        corpo,
        { id: ID, timestamp: velho, signature: sig },
        SEGREDO,
        NOW,
      ),
    ).toBe(false);
  });

  it('múltiplas assinaturas: basta uma bater', () => {
    const boa = assinar(corpo).slice(3); // sem o "v1,"
    const signature = `v1,assinaturafalsa v1,${boa}`;
    expect(
      verificarAssinaturaResend(
        corpo,
        { id: ID, timestamp: TS, signature },
        SEGREDO,
        NOW,
      ),
    ).toBe(true);
  });
});
