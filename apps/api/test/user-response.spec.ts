import { toAssinaturaResponse } from '../src/users/user-response';
import { calcularAcesso } from '../src/assinaturas/acesso';
import { Assinatura } from '../src/assinaturas/assinatura.entity';
import { AssinaturaStatus } from '../src/assinaturas/assinatura-status.enum';

// O bloco de assinatura do `/users/me` (T-127) — e os DOIS campos que a tela de
// assinatura passou a depender, cada um por causa de um bug real.

const NOW = new Date('2026-08-01T12:00:00Z');

function assinatura(over: Partial<Assinatura> = {}): Assinatura {
  return {
    id: 'a1',
    userId: 'u1',
    status: AssinaturaStatus.ACTIVE,
    plano: 'mensal',
    trialEndsAt: null,
    currentPeriodEnd: new Date('2026-09-01T03:00:00Z'),
    pastDueDesde: null,
    provider: 'asaas',
    cancelAtPeriodEnd: false,
    createdAt: new Date('2026-07-01T00:00:00Z'),
    ...over,
  } as Assinatura;
}

// `!` porque `toAssinaturaResponse` só devolve null quando a assinatura é null,
// e aqui ela nunca é — o caso null tem teste próprio no fim.
const montar = (a: Assinatura) =>
  toAssinaturaResponse(a, calcularAcesso(a, NOW))!;

describe('toAssinaturaResponse — o que a tela precisa saber', () => {
  // 🔴 Bug real (01/08): a tela decidia entre "portal hospedado da Stripe" e
  // "nossa tela do Asaas" pela resposta de `GET /assinaturas/portal`. Um 429
  // bastava para o front concluir "então é Stripe" e mostrar botões do Customer
  // Portal a um assinante do Asaas — que clicava e recebia "nenhuma assinatura
  // para gerenciar". Decisão de renderização não pode depender de requisição
  // que falha, por isso o provider viaja no estado.
  it('expõe o `provider` — é ele que decide QUAL tela renderizar', () => {
    expect(montar(assinatura({ provider: 'asaas' })).provider).toBe('asaas');
    expect(montar(assinatura({ provider: 'stripe' })).provider).toBe('stripe');
  });

  it('trial não tem provider — ninguém cobra ainda', () => {
    // O trial é NOSSO (T-127) e não existe em provedor nenhum.
    const r = montar(
      assinatura({
        status: AssinaturaStatus.TRIALING,
        provider: null,
        trialEndsAt: new Date('2026-08-05T12:00:00Z'),
        currentPeriodEnd: null,
      }),
    );
    expect(r.provider).toBeNull();
    expect(r.emTrial).toBe(true);
  });

  // O outro campo: o prazo da inadimplência. A tela precisa DIZER a data ("você
  // tem até 03/08") — "alguns dias", como dizia antes, não informa se a pessoa
  // corre hoje ou na semana que vem. Quem calcula é o backend (§3.3).
  it('`pastDueAte` sai da carência, e só existe em past_due', () => {
    const inadimplente = montar(
      assinatura({
        status: AssinaturaStatus.PAST_DUE,
        pastDueDesde: new Date('2026-08-01T00:00:00Z'),
      }),
    );
    // 7 dias de carência (decisão do dono, 31/07).
    expect(inadimplente.pastDueAte).toEqual(new Date('2026-08-08T00:00:00Z'));

    // Em qualquer outro estado é null — um prazo aqui seria fantasma na tela,
    // apontando para uma inadimplência que já foi resolvida.
    expect(montar(assinatura()).pastDueAte).toBeNull();
    expect(
      montar(assinatura({ status: AssinaturaStatus.CANCELED })).pastDueAte,
    ).toBeNull();
  });

  it('past_due sem `pastDueDesde` não inventa prazo', () => {
    const r = montar(assinatura({ status: AssinaturaStatus.PAST_DUE }));
    expect(r.pastDueAte).toBeNull();
    // E "não sei" nunca vira permissão.
    expect(r.acessoPermitido).toBe(false);
  });

  it('sem assinatura devolve null — não é erro, é conta sem cobrança', () => {
    expect(toAssinaturaResponse(null, calcularAcesso(null, NOW))).toBeNull();
  });
});
