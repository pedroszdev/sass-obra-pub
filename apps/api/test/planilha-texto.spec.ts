import {
  parseSharedStrings,
  sheetParaTexto,
} from '../src/editais/itens/planilha-texto.service';

// Parsing do XLSX em regex (T-64/T-109): sharedStrings.xml + worksheet XML → texto
// tabulado que vai para a IA. Testa o parser puro sem tocar em unzip/fs.
describe('parseSharedStrings', () => {
  it('extrai os textos <si><t> na ordem e decodifica entidades XML', () => {
    const xml = `<sst><si><t>Escavação</t></si><si><t>m&#179;</t></si><si><t>Concreto &amp; forma</t></si></sst>`;
    expect(parseSharedStrings(xml)).toEqual([
      'Escavação',
      'm³',
      'Concreto & forma',
    ]);
  });

  it('concatena runs (<r><t>) dentro de um mesmo <si>', () => {
    const xml = `<sst><si><r><t>Tubo </t></r><r><t>DN 300</t></r></si></sst>`;
    expect(parseSharedStrings(xml)).toEqual(['Tubo DN 300']);
  });
});

describe('sheetParaTexto', () => {
  const shared = ['Descrição', 'Escavação manual', 'm³'];

  it('resolve células de shared string (t="s") por índice', () => {
    const xml = `<worksheet><sheetData>
      <row><c t="s"><v>1</v></c><c t="s"><v>2</v></c></row>
    </sheetData></worksheet>`;
    expect(sheetParaTexto(xml, shared)).toBe('Escavação manual\tm³');
  });

  it('mantém números (sem t) como valor e tabula as células da linha', () => {
    const xml = `<worksheet><sheetData>
      <row><c t="s"><v>1</v></c><c><v>10</v></c><c><v>967.49</v></c></row>
    </sheetData></worksheet>`;
    expect(sheetParaTexto(xml, shared)).toBe('Escavação manual\t10\t967.49');
  });

  it('lê inline strings (t="inlineStr")', () => {
    const xml = `<worksheet><sheetData>
      <row><c t="inlineStr"><is><t>Aterro</t></is></c></row>
    </sheetData></worksheet>`;
    expect(sheetParaTexto(xml, shared)).toBe('Aterro');
  });

  it('ignora células vazias e linhas sem conteúdo; separa linhas por \\n', () => {
    const xml = `<worksheet><sheetData>
      <row><c t="s"><v>1</v></c></row>
      <row></row>
      <row><c><v>42</v></c></row>
    </sheetData></worksheet>`;
    expect(sheetParaTexto(xml, shared)).toBe('Escavação manual\n42');
  });
});
