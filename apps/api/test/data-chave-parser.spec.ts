import { parseDataChave } from '../src/agenda/data-chave-parser';

// O parser monta o instante em Brasília (-03:00); comparamos pelo ISO em UTC.
describe('parseDataChave (T-112)', () => {
  it('data + hora "às 09h" → instante correto (Brasília)', () => {
    const d = parseDataChave('12/07/2026 às 09h');
    // 09:00 -03:00 = 12:00Z
    expect(d?.toISOString()).toBe('2026-07-12T12:00:00.000Z');
  });

  it('data + "09:00"', () => {
    expect(parseDataChave('Sessão em 12/07/2026 09:00')?.toISOString()).toBe(
      '2026-07-12T12:00:00.000Z',
    );
  });

  it('data + "9h30" (hora e minuto)', () => {
    expect(parseDataChave('12/07/2026 9h30')?.toISOString()).toBe(
      '2026-07-12T12:30:00.000Z',
    );
  });

  it('só data (sem hora) → fim do dia em Brasília (não some no mesmo dia)', () => {
    // 23:59 -03:00 = 02:59Z do dia seguinte.
    expect(parseDataChave('12/07/2026')?.toISOString()).toBe(
      '2026-07-13T02:59:00.000Z',
    );
  });

  it('aceita separador . e -', () => {
    expect(parseDataChave('12.07.2026')).not.toBeNull();
    expect(parseDataChave('12-07-2026')).not.toBeNull();
  });

  it('texto sem data → null', () => {
    expect(parseDataChave('facultativa')).toBeNull();
    expect(parseDataChave('a definir')).toBeNull();
    expect(parseDataChave('conforme edital')).toBeNull();
    expect(parseDataChave('')).toBeNull();
  });

  it('data inválida (dia/mês fora do intervalo) → null', () => {
    expect(parseDataChave('32/07/2026')).toBeNull();
    expect(parseDataChave('12/13/2026')).toBeNull();
  });

  it('dia inexistente no mês → null (31/04, 30/02, 29/02 não-bissexto)', () => {
    expect(parseDataChave('31/04/2026')).toBeNull();
    expect(parseDataChave('30/02/2026')).toBeNull();
    expect(parseDataChave('29/02/2025')).toBeNull();
    // 2024 é bissexto → válido.
    expect(parseDataChave('29/02/2024')).not.toBeNull();
  });

  it('hora fora do intervalo é ignorada (cai pra sem-hora → fim do dia)', () => {
    // "25h" não casa como hora válida → trata como data sem hora.
    expect(parseDataChave('12/07/2026 25h')?.toISOString()).toBe(
      '2026-07-13T02:59:00.000Z',
    );
  });
});
