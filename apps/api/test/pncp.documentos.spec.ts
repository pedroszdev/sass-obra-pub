import {
  PncpArquivo,
  rankPncpArquivos,
} from '../src/editais/connectors/pncp/pncp.documentos';

describe('rankPncpArquivos', () => {
  it('coloca o EDITAL antes do projeto executivo/ART (achado da T-48)', () => {
    // Caso real (Sangão/SC): 3 arquivos, todos tipo "Edital".
    const arquivos: PncpArquivo[] = [
      { titulo: 'EXECUTIVO.pdf', tipoDocumentoNome: 'Edital', url: 'u-exec' },
      { titulo: 'ART.pdf', tipoDocumentoNome: 'Edital', url: 'u-art' },
      { titulo: 'EDITAL.pdf', tipoDocumentoNome: 'Edital', url: 'u-edital' },
    ];
    const ranked = rankPncpArquivos(arquivos);
    expect(ranked[0]).toEqual({ nome: 'EDITAL.pdf', url: 'u-edital' });
    expect(ranked.map((c) => c.url)).toEqual(['u-edital', 'u-exec', 'u-art']);
  });

  it('usa o tipo "Edital" quando o título não diz "edital" (sem ser projeto)', () => {
    const arquivos: PncpArquivo[] = [
      { titulo: 'anexo-i.pdf', tipoDocumentoNome: 'Anexo', url: 'u-anexo' },
      { titulo: '12345.pdf', tipoDocumentoNome: 'Edital', url: 'u-tipo' },
    ];
    expect(rankPncpArquivos(arquivos)[0].url).toBe('u-tipo');
  });

  it('ignora inativos e descarta itens sem URL', () => {
    const arquivos: PncpArquivo[] = [
      {
        titulo: 'EDITAL.pdf',
        tipoDocumentoNome: 'Edital',
        statusAtivo: false,
        url: 'u1',
      },
      { titulo: 'EDITAL-VIGENTE.pdf', tipoDocumentoNome: 'Edital', url: 'u2' },
      { titulo: 'sem-url.pdf', tipoDocumentoNome: 'Edital' },
    ];
    const ranked = rankPncpArquivos(arquivos);
    expect(ranked).toEqual([{ nome: 'EDITAL-VIGENTE.pdf', url: 'u2' }]);
  });

  it('usa uri quando não há url', () => {
    const arquivos: PncpArquivo[] = [
      { titulo: 'EDITAL.pdf', tipoDocumentoNome: 'Edital', uri: 'u-uri' },
    ];
    expect(rankPncpArquivos(arquivos)[0].url).toBe('u-uri');
  });
});
