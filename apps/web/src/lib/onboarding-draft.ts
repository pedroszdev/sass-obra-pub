import type { RegistroProfissionalTipo } from '../types/company-profile';

// Rascunho do onboarding (T-167): sem isto, um F5 no meio do fluxo zerava tudo
// o que o usuário digitou antes de "Salvar e continuar" — frustração no primeiro
// contato. Persistimos em `sessionStorage` (NÃO localStorage) de propósito:
//   - sobrevive ao F5 (o bug relatado),
//   - é escopado à aba e some sozinho quando ela fecha,
//   - e é limpo explicitamente ao concluir o onboarding (`clearOnboardingDraft`).
// Assim o PII (telefone/financeiro) fica no cliente só pelo tempo estritamente
// necessário ao rascunho (LGPD, T-102). Depois de salvo, o backend é a fonte.

const KEY = 'obrapub.onboarding';

export type OnboardingDraft = {
  active: number;
  razaoSocial: string;
  capitalSocial: number | '';
  patrimonioLiquido: number | '';
  telefone: string;
  regTipo: RegistroProfissionalTipo | null;
  regNumero: string;
  municipiosSel: string[];
  ufSel: string | null;
};

const LAST_STEP = 2;

/** Carrega o rascunho, ou `null` se não há / está corrompido / storage indisponível. */
export function loadOnboardingDraft(): OnboardingDraft | null {
  try {
    // sessionStorage pode lançar (modo privado, storage desabilitado); um JSON
    // corrompido também — tudo cai no catch e devolve null (rascunho é
    // conveniência, nunca pode quebrar o onboarding).
    const raw = globalThis.sessionStorage?.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<OnboardingDraft>;
    if (typeof p !== 'object' || p === null) return null;
    return {
      // Clampa o passo à faixa válida — um valor fora de faixa deixaria o
      // onboarding numa tela inexistente.
      active: clampStep(p.active),
      razaoSocial: str(p.razaoSocial),
      capitalSocial: numOrEmpty(p.capitalSocial),
      patrimonioLiquido: numOrEmpty(p.patrimonioLiquido),
      telefone: str(p.telefone),
      regTipo: p.regTipo === 'CREA' || p.regTipo === 'CAU' ? p.regTipo : null,
      regNumero: str(p.regNumero),
      municipiosSel: Array.isArray(p.municipiosSel)
        ? p.municipiosSel.filter((m): m is string => typeof m === 'string')
        : [],
      ufSel: typeof p.ufSel === 'string' ? p.ufSel : null,
    };
  } catch {
    return null;
  }
}

export function saveOnboardingDraft(draft: OnboardingDraft): void {
  try {
    globalThis.sessionStorage?.setItem(KEY, JSON.stringify(draft));
  } catch {
    // Rascunho é conveniência; se o storage recusar, o onboarding segue.
  }
}

export function clearOnboardingDraft(): void {
  try {
    globalThis.sessionStorage?.removeItem(KEY);
  } catch {
    /* nada a fazer */
  }
}

function clampStep(v: unknown): number {
  // Fora de faixa/garbage → 0 (início). Reset é mais seguro que clampar 99 para
  // o passo "pronto" — não jogamos ninguém na tela final por dado corrompido.
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= LAST_STEP
    ? v
    : 0;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function numOrEmpty(v: unknown): number | '' {
  return typeof v === 'number' && Number.isFinite(v) ? v : '';
}
