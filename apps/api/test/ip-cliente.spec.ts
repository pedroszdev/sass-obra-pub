import {
  IP_DESCONHECIDO,
  confiaEmCloudflare,
  escolherIp,
  ipDoCliente,
  ipDoClienteOuDesconhecido,
} from '../src/common/ip-cliente';

// T-204: quem é o IP do cliente. O teste que importa é o de REGRESSÃO — com a
// env desligada (estado de hoje, `api` em DNS-only) o resultado tem de ser
// idêntico ao `req.ips[0] ?? req.ip` que havia antes nos três pontos.
describe('escolherIp', () => {
  const base = { confiaCloudflare: false };

  describe('com a Cloudflare NÃO confiada (default, api em DNS-only)', () => {
    it('usa o 1º do X-Forwarded-For', () => {
      expect(
        escolherIp({ ...base, xffPrimeiro: '200.1.1.1', ipDireto: '10.0.0.9' }),
      ).toBe('200.1.1.1');
    });

    it('cai no ip direto quando não há XFF', () => {
      expect(escolherIp({ ...base, ipDireto: '10.0.0.9' })).toBe('10.0.0.9');
    });

    it('IGNORA CF-Connecting-IP — o cliente poderia forjá-lo', () => {
      expect(
        escolherIp({
          ...base,
          cfConnectingIp: '6.6.6.6',
          xffPrimeiro: '200.1.1.1',
        }),
      ).toBe('200.1.1.1');
    });

    it('devolve null quando não há fonte alguma', () => {
      expect(escolherIp(base)).toBeNull();
    });
  });

  describe('com a Cloudflare confiada (nuvem laranja ligada)', () => {
    const cf = { confiaCloudflare: true };

    it('CF-Connecting-IP vence o XFF, que o atacante pode ter injetado', () => {
      expect(
        escolherIp({
          ...cf,
          cfConnectingIp: '200.1.1.1',
          // O que um cliente mandaria para escolher o próprio balde de rate limit.
          xffPrimeiro: '1.2.3.4',
        }),
      ).toBe('200.1.1.1');
    });

    it('aceita IPv6', () => {
      expect(escolherIp({ ...cf, cfConnectingIp: '2001:db8::1' })).toBe(
        '2001:db8::1',
      );
    });

    it('cai no XFF se o header não for um IP de verdade (env ligada sem proxy)', () => {
      expect(
        escolherIp({
          ...cf,
          cfConnectingIp: "'; DROP TABLE admin_audit; --",
          xffPrimeiro: '200.1.1.1',
        }),
      ).toBe('200.1.1.1');
    });

    it('cai no XFF se o header estiver ausente', () => {
      expect(escolherIp({ ...cf, xffPrimeiro: '200.1.1.1' })).toBe('200.1.1.1');
    });
  });
});

describe('confiaEmCloudflare', () => {
  it.each(['1', 'true', 'TRUE', ' true '])('liga com %p', (v) => {
    expect(confiaEmCloudflare({ TRUST_CF_CONNECTING_IP: v })).toBe(true);
  });

  it.each([undefined, '', '0', 'false', 'sim', 'yes'])(
    'fica desligada com %p — o default é o comportamento de hoje',
    (v) => {
      expect(confiaEmCloudflare({ TRUST_CF_CONNECTING_IP: v })).toBe(false);
    },
  );
});

describe('ipDoCliente (adaptador de requisição)', () => {
  const original = process.env.TRUST_CF_CONNECTING_IP;
  afterEach(() => {
    if (original === undefined) delete process.env.TRUST_CF_CONNECTING_IP;
    else process.env.TRUST_CF_CONNECTING_IP = original;
  });

  it('lê o header (minúsculo, como o node entrega) quando a env está ligada', () => {
    process.env.TRUST_CF_CONNECTING_IP = 'true';
    expect(
      ipDoCliente({
        headers: { 'cf-connecting-ip': '200.1.1.1' },
        ips: ['1.2.3.4'],
      }),
    ).toBe('200.1.1.1');
  });

  it('header repetido (array): fica com o primeiro valor', () => {
    process.env.TRUST_CF_CONNECTING_IP = '1';
    expect(
      ipDoCliente({
        headers: { 'cf-connecting-ip': ['200.1.1.1', '9.9.9.9'] },
      }),
    ).toBe('200.1.1.1');
  });

  it('com a env ausente, ignora o header e usa o XFF (estado de hoje)', () => {
    delete process.env.TRUST_CF_CONNECTING_IP;
    expect(
      ipDoCliente({
        headers: { 'cf-connecting-ip': '6.6.6.6' },
        ips: ['200.1.1.1'],
      }),
    ).toBe('200.1.1.1');
  });

  it('sem IP algum devolve a chave de desconhecido, não "undefined"', () => {
    expect(ipDoClienteOuDesconhecido({})).toBe(IP_DESCONHECIDO);
  });
});
