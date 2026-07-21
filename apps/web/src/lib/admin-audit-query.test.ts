import { describe, expect, it } from 'vitest';
import { montarQueryAuditoria } from './admin-audit-query';

describe('montarQueryAuditoria (T-182)', () => {
  it('vazio → string vazia (sem ? solto)', () => {
    expect(montarQueryAuditoria({})).toBe('');
  });

  it('inclui só o que está preenchido', () => {
    expect(montarQueryAuditoria({ acao: 'trial.extend', page: 2 })).toBe(
      '?acao=trial.extend&page=2',
    );
  });

  it('ignora ação só com espaços e trima', () => {
    expect(montarQueryAuditoria({ acao: '   ' })).toBe('');
    expect(montarQueryAuditoria({ acao: '  trial.extend  ' })).toBe(
      '?acao=trial.extend',
    );
  });

  it('serializa período e paginação', () => {
    const qs = montarQueryAuditoria({
      desde: '2026-07-01',
      ate: '2026-07-21',
      page: 1,
      pageSize: 20,
    });
    expect(qs).toContain('desde=2026-07-01');
    expect(qs).toContain('ate=2026-07-21');
    expect(qs).toContain('pageSize=20');
  });
});
