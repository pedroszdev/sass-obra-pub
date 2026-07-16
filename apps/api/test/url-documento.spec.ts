import { assertUrlDocumento } from '../src/common/url-documento';

// A URL do documento vem VERBATIM do feed da fonte (PNCP) e vai direto para o
// `fetch` da extração — é o único endereço que baixamos sem ter montado. Exigir
// https fecha o SSRF clássico de graça: metadados de nuvem e serviço interno em
// texto claro só falam HTTP.
describe('assertUrlDocumento', () => {
  it('passa no https da fonte real', () => {
    expect(() =>
      assertUrlDocumento('https://pncp.gov.br/pncp-api/v1/orgaos/1/arquivos/2'),
    ).not.toThrow();
  });

  // O host fica de fora da allowlist de propósito (o PNCP serve de CDN): outro
  // domínio em https tem de passar, senão a extração quebra quando eles mudarem
  // de infra.
  it('passa em https de outro host (CDN da fonte)', () => {
    expect(() =>
      assertUrlDocumento('https://cdn.exemplo.com/arquivo.pdf'),
    ).not.toThrow();
  });

  it('recusa http em texto claro', () => {
    expect(() => assertUrlDocumento('http://pncp.gov.br/edital.pdf')).toThrow(
      /só https/,
    );
  });

  // O caso que o controle existe para fechar: metadados de nuvem só falam HTTP.
  it('recusa o endpoint de metadados de nuvem', () => {
    expect(() =>
      assertUrlDocumento('http://169.254.169.254/latest/meta-data/'),
    ).toThrow(/só https/);
  });

  it('recusa serviço interno em texto claro', () => {
    expect(() => assertUrlDocumento('http://localhost:5432/')).toThrow(
      /só https/,
    );
  });

  it('recusa esquema que não é http(s)', () => {
    expect(() => assertUrlDocumento('file:///etc/passwd')).toThrow(/só https/);
    expect(() => assertUrlDocumento('ftp://x/arquivo.pdf')).toThrow(/só https/);
  });

  // Lixo no feed não pode virar TypeError (500) lá em cima: o chamador espera
  // Error e segue para o próximo candidato.
  it('recusa URL malformada sem explodir', () => {
    expect(() => assertUrlDocumento('não é url')).toThrow(/inválida/);
    expect(() => assertUrlDocumento('')).toThrow(/inválida/);
  });
});
