import type { AuthResult, AuthTokens, UserMe } from '../types/auth';
import type {
  ArquivoMeta,
  Atestado,
  AtestadoInput,
  Certidao,
  CertidaoInput,
  CompanyProfileSnapshot,
  ProntidaoResult,
} from '../types/company-profile';
import type {
  EditalDetail,
  EditalIaResult,
  EditalListItem,
  EditalSearchResult,
  SearchEditaisParams,
} from '../types/edital';
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setTokens,
} from './auth';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

/** Erro de chamada à API. `status === 0` indica falha de rede/conexão. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Anexa o `Authorization: Bearer`. Default `true`. */
  auth?: boolean;
  signal?: AbortSignal;
  /** `'blob'` para baixar binário (download de arquivo); default JSON. */
  responseType?: 'json' | 'blob';
}

async function extractMessage(response: Response, path: string): Promise<string> {
  try {
    const data: unknown = await response.json();
    if (data && typeof data === 'object' && 'message' in data) {
      const message = (data as { message: unknown }).message;
      if (typeof message === 'string') return message;
      if (Array.isArray(message)) return message.join(' ');
    }
  } catch {
    // corpo não-JSON ou vazio — cai no texto genérico
  }
  return `Erro ${response.status} ao acessar ${path}.`;
}

async function rawRequest<T>(
  path: string,
  options: RequestOptions,
  accessToken: string | null,
): Promise<T> {
  // FormData (upload de arquivo) vai cru: o browser define o Content-Type com o
  // boundary do multipart. JSON é serializado e tipado como application/json.
  const isForm = options.body instanceof FormData;
  const headers: Record<string, string> = {};
  if (options.responseType !== 'blob') headers.Accept = 'application/json';
  if (options.body !== undefined && !isForm) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.auth !== false && accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body:
        options.body === undefined
          ? undefined
          : isForm
            ? (options.body as FormData)
            : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (err) {
    // Repassa o abort para o chamador poder ignorá-lo; o resto é falha de rede.
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(0, 'Não foi possível conectar ao servidor.');
  }

  if (!response.ok) {
    throw new ApiError(response.status, await extractMessage(response, path));
  }
  if (response.status === 204) return undefined as T;
  if (options.responseType === 'blob') return (await response.blob()) as T;
  return (await response.json()) as T;
}

// Renovação de token coalescida: vários 401 simultâneos compartilham um único
// /auth/refresh em voo.
let refreshing: Promise<string | null> | null = null;

function tryRefresh(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return Promise.resolve(null);
  if (!refreshing) {
    refreshing = rawRequest<AuthTokens>(
      '/auth/refresh',
      { method: 'POST', body: { refreshToken }, auth: false },
      null,
    )
      .then((tokens) => {
        setTokens(tokens.accessToken, tokens.refreshToken);
        return tokens.accessToken;
      })
      .catch(() => null)
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

/**
 * Faz a chamada anexando o access token; em 401 tenta um /auth/refresh e repete
 * uma vez. Se a renovação falhar, limpa os tokens (dispara logout/redirect via
 * pub/sub) e propaga o erro.
 */
async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const useAuth = options.auth !== false;
  try {
    return await rawRequest<T>(path, options, useAuth ? getAccessToken() : null);
  } catch (err) {
    if (useAuth && err instanceof ApiError && err.status === 401) {
      const newToken = await tryRefresh();
      if (newToken) return rawRequest<T>(path, options, newToken);
      clearTokens();
    }
    throw err;
  }
}

function buildQuery(params: SearchEditaisParams): string {
  const sp = new URLSearchParams();
  if (params.uf) sp.set('uf', params.uf);
  if (params.q) sp.set('q', params.q);
  if (params.codigoIbge) sp.set('codigoIbge', params.codigoIbge);
  if (params.valorMin != null) sp.set('valorMin', String(params.valorMin));
  if (params.valorMax != null) sp.set('valorMax', String(params.valorMax));
  if (params.dataInicio) sp.set('dataInicio', params.dataInicio);
  if (params.dataFim) sp.set('dataFim', params.dataFim);
  if (params.page != null) sp.set('page', String(params.page));
  if (params.pageSize != null) sp.set('pageSize', String(params.pageSize));
  const qs = sp.toString();
  return qs ? `?${qs}` : '';
}

// ---- endpoints ----

/** GET genérico autenticado (lança `ApiError` em falha). */
export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path);
}

export function login(email: string, password: string): Promise<AuthResult> {
  return request<AuthResult>('/auth/login', {
    method: 'POST',
    body: { email, password },
    auth: false,
  });
}

/** Revoga o refresh token no servidor (best-effort). */
export async function logout(): Promise<void> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return;
  try {
    await rawRequest<void>(
      '/auth/logout',
      { method: 'POST', body: { refreshToken }, auth: false },
      null,
    );
  } catch {
    // o estado local é limpo de qualquer forma — não bloqueia o logout
  }
}

export function getMe(): Promise<UserMe> {
  return request<UserMe>('/users/me');
}

export function searchEditais(
  params: SearchEditaisParams,
  signal?: AbortSignal,
): Promise<EditalSearchResult> {
  return request<EditalSearchResult>(`/editais${buildQuery(params)}`, { signal });
}

export function getEdital(id: string, signal?: AbortSignal): Promise<EditalDetail> {
  return request<EditalDetail>(`/editais/${id}`, { signal });
}

// Análise por IA do edital (T-49/T-50): extrai na 1ª vez e cacheia. Pode levar
// alguns segundos na 1ª chamada (a IA lê o PDF do edital).
export function getEditalIa(
  id: string,
  signal?: AbortSignal,
): Promise<EditalIaResult> {
  return request<EditalIaResult>(`/editais/${id}/exigencias`, { signal });
}

// ---- favoritos (T-31) ----

export function getFavoritos(): Promise<{ data: EditalListItem[] }> {
  return request<{ data: EditalListItem[] }>('/favoritos');
}

export function addFavorito(editalId: string): Promise<void> {
  return request<void>('/favoritos', { method: 'POST', body: { editalId } });
}

export function removeFavorito(editalId: string): Promise<void> {
  return request<void>(`/favoritos/${editalId}`, { method: 'DELETE' });
}

// ---- perfil de habilitação (T-41 / T-41b) ----

export function getCompanyProfile(
  signal?: AbortSignal,
): Promise<CompanyProfileSnapshot> {
  return request<CompanyProfileSnapshot>('/company-profile', { signal });
}

export function getProntidao(signal?: AbortSignal): Promise<ProntidaoResult> {
  return request<ProntidaoResult>('/company-profile/prontidao', { signal });
}

export function addCertidao(input: CertidaoInput): Promise<Certidao> {
  return request<Certidao>('/company-profile/certidoes', {
    method: 'POST',
    body: input,
  });
}

export function updateCertidao(
  id: string,
  input: Partial<CertidaoInput>,
): Promise<Certidao> {
  return request<Certidao>(`/company-profile/certidoes/${id}`, {
    method: 'PUT',
    body: input,
  });
}

export function removeCertidao(id: string): Promise<void> {
  return request<void>(`/company-profile/certidoes/${id}`, { method: 'DELETE' });
}

export function addAtestado(input: AtestadoInput): Promise<Atestado> {
  return request<Atestado>('/company-profile/atestados', {
    method: 'POST',
    body: input,
  });
}

export function updateAtestado(
  id: string,
  input: Partial<AtestadoInput>,
): Promise<Atestado> {
  return request<Atestado>(`/company-profile/atestados/${id}`, {
    method: 'PUT',
    body: input,
  });
}

export function removeAtestado(id: string): Promise<void> {
  return request<void>(`/company-profile/atestados/${id}`, { method: 'DELETE' });
}

export function uploadCertidaoArquivo(
  certidaoId: string,
  file: File,
): Promise<ArquivoMeta> {
  const form = new FormData();
  form.append('arquivo', file);
  return request<ArquivoMeta>(
    `/company-profile/certidoes/${certidaoId}/arquivo`,
    { method: 'POST', body: form },
  );
}

export function removeCertidaoArquivo(certidaoId: string): Promise<void> {
  return request<void>(`/company-profile/certidoes/${certidaoId}/arquivo`, {
    method: 'DELETE',
  });
}

/** Baixa o arquivo da certidão (com auth) e dispara o download no browser. */
export async function downloadCertidaoArquivo(
  certidaoId: string,
  nomeArquivo: string,
): Promise<void> {
  const blob = await request<Blob>(
    `/company-profile/certidoes/${certidaoId}/arquivo`,
    { responseType: 'blob' },
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export { API_URL };
