import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearOnboardingDraft,
  loadOnboardingDraft,
  saveOnboardingDraft,
  type OnboardingDraft,
} from './onboarding-draft';

function fakeSessionStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
}

const CHEIO: OnboardingDraft = {
  active: 1,
  razaoSocial: 'Construtora Prumo',
  capitalSocial: 100000,
  patrimonioLiquido: '',
  telefone: '(11) 90000-0000',
  regTipo: 'CREA',
  regNumero: '0987654',
  municipiosSel: ['3550308', '3509502'],
  ufSel: 'SP',
};

describe('onboarding-draft (T-167)', () => {
  beforeEach(() => vi.stubGlobal('sessionStorage', fakeSessionStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it('sem rascunho, load devolve null', () => {
    expect(loadOnboardingDraft()).toBeNull();
  });

  it('round-trip preserva todos os campos', () => {
    saveOnboardingDraft(CHEIO);
    expect(loadOnboardingDraft()).toEqual(CHEIO);
  });

  it('clear apaga o rascunho', () => {
    saveOnboardingDraft(CHEIO);
    clearOnboardingDraft();
    expect(loadOnboardingDraft()).toBeNull();
  });

  it('JSON corrompido devolve null (não quebra o onboarding)', () => {
    sessionStorage.setItem('obrapub.onboarding', '{nao é json');
    expect(loadOnboardingDraft()).toBeNull();
  });

  it('clampa active fora de faixa para 0', () => {
    saveOnboardingDraft({ ...CHEIO, active: 99 });
    expect(loadOnboardingDraft()?.active).toBe(0);
    saveOnboardingDraft({ ...CHEIO, active: -1 });
    expect(loadOnboardingDraft()?.active).toBe(0);
  });

  it('regTipo inválido vira null; municipios não-string somem', () => {
    sessionStorage.setItem(
      'obrapub.onboarding',
      JSON.stringify({ ...CHEIO, regTipo: 'XPTO', municipiosSel: ['3550308', 42, null] }),
    );
    const d = loadOnboardingDraft();
    expect(d?.regTipo).toBeNull();
    expect(d?.municipiosSel).toEqual(['3550308']);
  });

  it('storage indisponível não lança', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('bloqueado');
      },
      removeItem: () => {
        throw new Error('bloqueado');
      },
    });
    expect(() => saveOnboardingDraft(CHEIO)).not.toThrow();
    expect(loadOnboardingDraft()).toBeNull();
    expect(() => clearOnboardingDraft()).not.toThrow();
  });
});
