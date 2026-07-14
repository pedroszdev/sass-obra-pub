import {
  parseNumeroControlePncp,
  pncpLinkEdital,
} from '../src/editais/connectors/pncp/pncp.link';

// O `linkSistemaOrigem` do PNCP (→ `linkOrigem`) é OPCIONAL e muitos órgãos não
// preenchem — nesses editais o botão "ver edital" ficava desabilitado, como se
// não houvesse documento. O link daqui é derivado do numeroControlePNCP, que
// TODO edital captado tem (é a chave de dedup, §3.2).
describe('pncpLinkEdital (T-142)', () => {
  it('deriva a página da compra a partir do número de controle', () => {
    expect(pncpLinkEdital('43465459000173-1-000319/2026')).toBe(
      'https://pncp.gov.br/app/editais/43465459000173/2026/319',
    );
  });

  // O portal (e a API de arquivos) esperam o sequencial SEM zeros à esquerda.
  it('remove os zeros à esquerda do sequencial', () => {
    expect(pncpLinkEdital('39217831000155-1-000053/2026')).toBe(
      'https://pncp.gov.br/app/editais/39217831000155/2026/53',
    );
  });

  it('tolera espaços em volta', () => {
    expect(pncpLinkEdital('  43465459000173-1-000319/2026  ')).toBe(
      'https://pncp.gov.br/app/editais/43465459000173/2026/319',
    );
  });

  // Fora do padrão → null. Não inventa link: mandar o usuário para uma página
  // que não existe é pior do que não oferecer o botão.
  it.each([
    '',
    'lixo',
    '43465459000173/2026',
    'abc-1-000319/2026',
    '43465459000173-1-000319',
  ])('devolve null para número de controle inválido: %s', (n) => {
    expect(pncpLinkEdital(n)).toBeNull();
  });

  it('parse devolve as partes que a API de arquivos usa', () => {
    expect(parseNumeroControlePncp('43465459000173-1-000319/2026')).toEqual({
      cnpj: '43465459000173',
      ano: '2026',
      sequencial: '319',
    });
  });
});
