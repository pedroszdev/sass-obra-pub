import { CertidaoTipo } from '../src/company-profile/certidao-tipo.enum';
import { REQUISITOS_HABILITACAO_OBRA } from '../src/company-profile/habilitacao/requisitos-catalog';

describe('REQUISITOS_HABILITACAO_OBRA (catálogo T-44)', () => {
  it('tem requisitos cadastrados', () => {
    expect(REQUISITOS_HABILITACAO_OBRA.length).toBeGreaterThan(0);
  });

  it('keys são únicas', () => {
    const keys = REQUISITOS_HABILITACAO_OBRA.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('label e descrição não são vazios', () => {
    for (const r of REQUISITOS_HABILITACAO_OBRA) {
      expect(r.label.trim().length).toBeGreaterThan(0);
      expect(r.descricao.trim().length).toBeGreaterThan(0);
    }
  });

  it('todo check de certidão aponta para um CertidaoTipo válido (e não OUTRA)', () => {
    const tipos = Object.values(CertidaoTipo);
    for (const r of REQUISITOS_HABILITACAO_OBRA) {
      if (r.check.tipo === 'certidao') {
        expect(tipos).toContain(r.check.certidaoTipo);
        expect(r.check.certidaoTipo).not.toBe(CertidaoTipo.OUTRA);
      }
    }
  });

  it('cobre as certidões comuns de obra (CND, FGTS, CNDT, estadual, municipal, falência)', () => {
    const certidaoTipos = REQUISITOS_HABILITACAO_OBRA.filter(
      (r) => r.check.tipo === 'certidao',
    ).map((r) => (r.check as { certidaoTipo: CertidaoTipo }).certidaoTipo);
    for (const esperado of [
      CertidaoTipo.CND_FEDERAL,
      CertidaoTipo.FGTS,
      CertidaoTipo.TRABALHISTA,
      CertidaoTipo.ESTADUAL,
      CertidaoTipo.MUNICIPAL,
      CertidaoTipo.FALENCIA,
    ]) {
      expect(certidaoTipos).toContain(esperado);
    }
  });

  it('inclui os requisitos técnicos e econômico-financeiros não-certidão', () => {
    const checkTipos = REQUISITOS_HABILITACAO_OBRA.map((r) => r.check.tipo);
    expect(checkTipos).toContain('registro_conselho');
    expect(checkTipos).toContain('capacidade_tecnica');
    expect(checkTipos).toContain('capital_social');
  });
});
