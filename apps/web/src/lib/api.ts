import type {
  AccountDetail,
  AccountsFilter,
  AccountsPage,
  AdminAuditPage,
  AuditFilter,
  DisparoResposta,
  IaOutputsPagina,
  FeedbackPagina,
  FeedbackStatus,
  PainelCaptacao,
  ResumoAdmin,
  ResumoBuscas,
  SaudeIntegracoes,
  TipoSaidaIa,
} from '../types/admin';
import type { AgendaEvento } from '../types/agenda';
import type { AlertasResult } from '../types/alerta';
import type {
  AuthResult,
  DetalhesAssinatura,
  NotificationPrefs,
  Plano,
  PrecosResponse,
  RegisterInput,
  UserMe,
} from '../types/auth';
import type {
  ArquivoMeta,
  Atestado,
  AtestadoInput,
  Certidao,
  CertidaoInput,
  CompanyProfile,
  CompanyProfileInput,
  CompanyProfileSnapshot,
  ProntidaoResult,
} from '../types/company-profile';
import type {
  DiagnosticoEditalResponse,
  DocumentoEdital,
  EditaisAptosResult,
  EditalDetail,
  EditalIaResult,
  EditalListItem,
  EditalSearchResult,
  SearchEditaisParams,
} from '../types/edital';
import type { Municipio } from '../types/geo';
import type {
  CreatePropostaInput,
  CreatePropostaItemInput,
  ImportarItensResponse,
  Proposta,
  PropostaDetail,
  PropostaItem,
  PropostaListItem,
  PropostaStatus,
  UpdatePropostaItemInput,
} from '../types/proposta';
import { montarQueryContas } from './admin-accounts-query';
import { montarQueryAuditoria } from './admin-audit-query';
import { limparSessao, marcarSessao } from './auth';
import { amigavel } from './erros';

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
  /** Tenta renovar a sessão num 401. Default `true` (false nas rotas de auth). */
  auth?: boolean;
  signal?: AbortSignal;
  /** `'blob'` para baixar binário (download de arquivo); default JSON. */
  responseType?: 'json' | 'blob';
  /**
   * Aborta a requisição depois de N ms e lança `ApiError(408)` (T-174). Opt-in:
   * sem isto, a requisição espera para sempre — foi o que deixou o upload de
   * certidão "pendente" sem feedback. Só para rotas onde travar é pior que
   * esperar (uploads); a navegação normal segue sem timeout.
   */
  timeoutMs?: number;
}

/** Status sintético para timeout do cliente (não é resposta do servidor). */
const TIMEOUT_STATUS = 408;

async function extractMessage(response: Response, path: string): Promise<string> {
  let crua = '';
  try {
    const data: unknown = await response.json();
    if (data && typeof data === 'object' && 'message' in data) {
      const message = (data as { message: unknown }).message;
      if (typeof message === 'string') crua = message;
      else if (Array.isArray(message)) crua = message.join(' ');
    }
  } catch {
    // corpo não-JSON ou vazio — cai no texto genérico
  }
  // T-170: traduz vazamentos de framework (429/5xx/validação em inglês) para
  // PT-BR amigável aqui na origem — todo ponto que exibe `err.message` já recebe
  // o texto tratado. Mensagens de domínio em PT-BR passam intactas.
  return amigavel(response.status, crua || `Erro ${response.status} ao acessar ${path}.`);
}

async function rawRequest<T>(path: string, options: RequestOptions): Promise<T> {
  // FormData (upload de arquivo) vai cru: o browser define o Content-Type com o
  // boundary do multipart. JSON é serializado e tipado como application/json.
  const isForm = options.body instanceof FormData;
  const headers: Record<string, string> = {};
  if (options.responseType !== 'blob') headers.Accept = 'application/json';
  if (options.body !== undefined && !isForm) {
    headers['Content-Type'] = 'application/json';
  }
  // Timeout opt-in (T-174): só quando `timeoutMs` está setado, envolvemos a
  // requisição num AbortController próprio (composto com o signal do chamador).
  // Sem timeout, o caminho é idêntico ao de antes (`signal: options.signal`).
  const controller = options.timeoutMs != null ? new AbortController() : null;
  let expirou = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  if (controller) {
    timer = setTimeout(() => {
      expirou = true;
      controller.abort();
    }, options.timeoutMs);
    if (options.signal) {
      if (options.signal.aborted) controller.abort();
      else
        options.signal.addEventListener('abort', () => controller.abort(), {
          once: true,
        });
    }
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
      signal: controller ? controller.signal : options.signal,
      // É AQUI que a autenticação acontece (T-155): os cookies httpOnly (access e
      // refresh) viajam sozinhos. Não existe token no JS para anexar à mão — e é
      // esse o ponto: um XSS não tem o que roubar.
      credentials: 'include',
    });
  } catch (err) {
    // Repassa o abort para o chamador poder ignorá-lo; o resto é falha de rede.
    if (err instanceof DOMException && err.name === 'AbortError') {
      // Foi o NOSSO timer que abortou (não o chamador) → vira 408 com mensagem.
      if (expirou) {
        throw new ApiError(
          TIMEOUT_STATUS,
          'O envio demorou demais. Verifique sua conexão e tente de novo.',
        );
      }
      throw err;
    }
    throw new ApiError(0, 'Não foi possível conectar ao servidor.');
  } finally {
    if (timer) clearTimeout(timer);
  }

  if (!response.ok) {
    throw new ApiError(response.status, await extractMessage(response, path));
  }
  if (response.status === 204) return undefined as T;
  if (options.responseType === 'blob') return (await response.blob()) as T;
  // Corpo VAZIO com 200 (ex.: /auth/refresh, que só seta cookies — T-155): um
  // `response.json()` direto estoura com "Unexpected end of JSON input", e o
  // chamador vê a chamada FALHAR apesar do 200. Foi isso que quebrou o login com
  // Google (o /entrando dava refresh 200 e caía no catch antes do getMe). Lê como
  // texto e só parseia se houver conteúdo.
  const texto = await response.text();
  return (texto ? (JSON.parse(texto) as T) : (undefined as T));
}

// Renovação coalescida: vários 401 simultâneos compartilham um único
// /auth/refresh em voo. O token novo volta num COOKIE — nada a guardar aqui.
let refreshing: Promise<boolean> | null = null;

function tryRefresh(): Promise<boolean> {
  if (!refreshing) {
    refreshing = rawRequest<void>('/auth/refresh', {
      method: 'POST',
      auth: false,
    })
      .then(() => {
        marcarSessao();
        return true;
      })
      .catch((err: unknown) => {
        // SÓ um 401/403 real invalida a sessão (cookie ausente/expirado/revogado).
        // Rede / 5xx / cold start do Render (ApiError status 0) é transitório: não
        // desloga ninguém por um blip (T-119c).
        if (
          err instanceof ApiError &&
          (err.status === 401 || err.status === 403)
        ) {
          limparSessao();
        }
        return false;
      })
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
    return await rawRequest<T>(path, options);
  } catch (err) {
    if (useAuth && err instanceof ApiError && err.status === 401) {
      const renovou = await tryRefresh();
      if (renovou) return rawRequest<T>(path, options);
      // Não limpa aqui (T-119c): o tryRefresh já decide — só desloga em 401/403
      // real, nunca em erro de rede/cold start. Aqui só propaga a falha.
    }
    // Paywall (T-130): o backend barrou por acesso vencido. Isso acontece quando
    // o estado local do usuário está velho (o trial expirou com o app aberto) — o
    // /users/me em cache ainda dizia "liberado". Leva para a tela de assinatura,
    // onde o /users/me fresco mostra o bloqueio e o caminho de pagar. O reload é
    // o jeito mais simples de reidratar o estado inteiro.
    if (
      err instanceof ApiError &&
      err.status === 402 &&
      typeof window !== 'undefined' &&
      window.location.pathname !== '/assinatura'
    ) {
      window.location.href = '/assinatura';
    }
    throw err;
  }
}

function buildQuery(params: SearchEditaisParams): string {
  const sp = new URLSearchParams();
  // uf e codigoIbge viram params repetidos (?uf=SC&uf=PR) — T-81.
  for (const uf of params.uf ?? []) sp.append('uf', uf);
  if (params.q) sp.set('q', params.q);
  for (const ibge of params.codigoIbge ?? []) sp.append('codigoIbge', ibge);
  // modalidade vira param repetido: ?modalidade=4&modalidade=5 (T-80).
  for (const m of params.modalidade ?? []) sp.append('modalidade', String(m));
  if (params.sort) sp.set('sort', params.sort);
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

/** Quantos editais de obra estão abertos agora. Rota PÚBLICA — alimenta o
 *  contador da tela de login, que não tem sessão. */
export function getEditaisStats(): Promise<{ abertos: number }> {
  return request<{ abertos: number }>('/editais/stats', { auth: false });
}

/** Entrar/cadastrar com Google (T-126). Mesmo contrato do login: o backend seta o
 *  cookie de refresh e devolve access token + usuário. `aceiteTermos` só é exigido
 *  quando a conta é nova (quem já tem conta está apenas logando). */
export function loginGoogle(
  idToken: string,
  aceiteTermos?: boolean,
): Promise<AuthResult> {
  return request<AuthResult>('/auth/google', {
    method: 'POST',
    body: { idToken, aceiteTermos },
    auth: false,
  });
}

/** Renova a sessão a partir do cookie httpOnly de refresh (T-126b). Usado quando
 *  a sessão nasce fora do JS — é o caso da volta do Google, em que o cookie já
 *  veio no 302 e o front ainda não tem token nenhum. */
export function renovarSessao(): Promise<void> {
  return request<void>('/auth/refresh', {
    method: 'POST',
    auth: false,
  });
}

/** Verifica o e-mail a partir do token do link (T-132). */
export function verifyEmail(token: string): Promise<void> {
  return request<void>('/auth/verify-email', {
    method: 'POST',
    body: { token },
    auth: false,
  });
}

/** Reenvia o e-mail de verificação para o usuário logado (T-132). */
export function resendVerification(): Promise<void> {
  return request<void>('/auth/resend-verification', { method: 'POST' });
}

/** "Esqueci a senha" (T-101). Sempre resolve (não vaza se o e-mail existe). */
export function forgotPassword(email: string): Promise<void> {
  return request<void>('/auth/forgot-password', {
    method: 'POST',
    body: { email },
    auth: false,
  });
}

/** Redefine a senha a partir do token do e-mail (T-101). */
export function resetPassword(token: string, novaSenha: string): Promise<void> {
  return request<void>('/auth/reset-password', {
    method: 'POST',
    body: { token, novaSenha },
    auth: false,
  });
}

/** Cadastro self-service (T-100). Auto-login: o backend já seta o cookie de
 *  refresh e devolve o access token + usuário. */
export function register(input: RegisterInput): Promise<AuthResult> {
  return request<AuthResult>('/auth/register', {
    method: 'POST',
    body: input,
    auth: false,
  });
}

/** Revoga o refresh e limpa os DOIS cookies no servidor (só ele pode: são
 *  httpOnly). Best-effort. */
export async function logout(): Promise<void> {
  try {
    await rawRequest<void>('/auth/logout', { method: 'POST', auth: false });
  } catch {
    // o estado local é limpo de qualquer forma — não bloqueia o logout
  }
}

export function getMe(): Promise<UserMe> {
  return request<UserMe>('/users/me');
}

/** Exporta todos os dados do titular (T-102/LGPD) e dispara o download do JSON. */
export async function exportarMeusDados(): Promise<void> {
  const dump = await request<Record<string, unknown>>('/users/me/export');
  const blob = new Blob([JSON.stringify(dump, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'meus-dados-prumolicita.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Exclui a conta do titular (T-102/LGPD). Exige prova de posse atual: a senha,
 *  ou um id_token fresco do Google para conta sem senha (T-126). */
export function excluirConta(
  credencial: { senha: string } | { idToken: string },
): Promise<void> {
  return request<void>('/users/me', { method: 'DELETE', body: credencial });
}

/** Define a UF de atuação (T-126). Conta criada pelo Google nasce sem UF, e sem
 *  ela a captação por região não roda — o onboarding coleta por aqui. */
export function updateUf(uf: string): Promise<UserMe> {
  return request<UserMe>('/users/me/uf', { method: 'PUT', body: { uf } });
}

/** Substitui os municípios de atuação preferidos (T-94). Manda a lista completa
 *  de códigos IBGE; devolve o usuário atualizado. */
export function updateMunicipios(codigosIbge: string[]): Promise<UserMe> {
  return request<UserMe>('/users/me/municipios', {
    method: 'PUT',
    body: { codigosIbge },
  });
}

// Preferências de notificação (T-89) — devolve o usuário atualizado.
export function updateNotificationPrefs(
  prefs: NotificationPrefs,
): Promise<UserMe> {
  return request<UserMe>('/users/me/notifications', {
    method: 'PUT',
    body: prefs,
  });
}

// Troca de senha do usuário logado (T-89). 204 em sucesso.
export function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  return request<void>('/auth/change-password', {
    method: 'POST',
    body: { currentPassword, newPassword },
  });
}

// ---- geo (municípios do IBGE) ----

/** Municípios de uma UF para o seletor de município da busca. */
export function getMunicipios(
  uf: string,
  signal?: AbortSignal,
): Promise<Municipio[]> {
  return request<Municipio[]>(`/geo/municipios?uf=${encodeURIComponent(uf)}`, {
    signal,
  });
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

// ---- assinatura (T-128/T-131) ----

// Abre o Checkout da Stripe e devolve a URL para redirecionar. NADA aqui confirma
// pagamento: quem confirma é o webhook (T-129). O retorno do navegador é só
// navegação.
export function criarCheckout(plano: Plano = 'mensal'): Promise<{ url: string }> {
  // `body` vai CRU: o rawRequest é quem serializa. Um JSON.stringify aqui
  // mandaria uma string JSON dentro de JSON e o backend recusaria o corpo.
  return request<{ url: string }>('/assinaturas/checkout', {
    method: 'POST',
    body: { plano },
  });
}

// Preços dos planos (T-131), lidos da Stripe pelo backend. NUNCA escreva um
// preço no front: ele divergiria do que a Stripe cobra de fato.
export function getPrecos(signal?: AbortSignal): Promise<PrecosResponse> {
  return request<PrecosResponse>('/assinaturas/precos', { signal });
}

// Faturas, cartão e "assinante desde" (T-131). Vazio para quem está no trial —
// ainda não existe cliente na Stripe.
export function getDetalhesAssinatura(
  signal?: AbortSignal,
): Promise<DetalhesAssinatura> {
  return request<DetalhesAssinatura>('/assinaturas/detalhes', { signal });
}

// Customer Portal da Stripe (trocar cartão, faturas, cancelar) — só para quem já
// pagou. É ele que dispensa telas nossas de gestão de assinatura.
export function abrirPortalAssinatura(): Promise<{ url: string }> {
  return request<{ url: string }>('/assinaturas/portal', { method: 'POST' });
}

// Documentos publicados do edital (T-142): o principal (o mesmo que a IA lê)
// primeiro. Lista vazia = a fonte não publicou arquivo.
export function getEditalDocumentos(
  id: string,
  signal?: AbortSignal,
): Promise<DocumentoEdital[]> {
  return request<DocumentoEdital[]>(`/editais/${id}/documentos`, { signal });
}

// Busca filtrada pela aptidão do usuário (T-53): só obras em que está apto/quase,
// dentre as já analisadas por IA. Mesmos filtros da busca normal.
export function getEditaisAptos(
  params: SearchEditaisParams,
  signal?: AbortSignal,
): Promise<EditaisAptosResult> {
  return request<EditaisAptosResult>(
    `/company-profile/editais-aptos${buildQuery(params)}`,
    { signal },
  );
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

/** Salva os escalares do perfil (T-108). Merge no backend — manda só o que mudou. */
export function updateCompanyProfile(
  input: CompanyProfileInput,
): Promise<CompanyProfile> {
  return request<CompanyProfile>('/company-profile', {
    method: 'PUT',
    body: input,
  });
}

export function getProntidao(signal?: AbortSignal): Promise<ProntidaoResult> {
  return request<ProntidaoResult>('/company-profile/prontidao', { signal });
}

// Diagnóstico específico do usuário para um edital (T-51/T-52). Dispara a
// extração por IA na 1ª vez (cacheada) — pode levar alguns segundos.
export function getDiagnosticoEdital(
  editalId: string,
  signal?: AbortSignal,
): Promise<DiagnosticoEditalResponse> {
  return request<DiagnosticoEditalResponse>(
    `/company-profile/diagnostico/${editalId}`,
    { signal },
  );
}

// Timeout do fluxo de certidão (T-174): o upload de PDF → bytea pode pendurar
// (rede ruim, cold start do Render) e antes ficava "pendente" para sempre. 45s
// é folgado o bastante para um upload lento legítimo, mas fecha o "gira eterno".
const CERTIDAO_TIMEOUT_MS = 45_000;

export function addCertidao(input: CertidaoInput): Promise<Certidao> {
  return request<Certidao>('/company-profile/certidoes', {
    method: 'POST',
    body: input,
    timeoutMs: CERTIDAO_TIMEOUT_MS,
  });
}

export function updateCertidao(
  id: string,
  input: Partial<CertidaoInput>,
): Promise<Certidao> {
  return request<Certidao>(`/company-profile/certidoes/${id}`, {
    method: 'PUT',
    body: input,
    timeoutMs: CERTIDAO_TIMEOUT_MS,
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
    { method: 'POST', body: form, timeoutMs: CERTIDAO_TIMEOUT_MS },
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

// Abre o arquivo (PDF/imagem) numa nova aba. Como a autenticação é por header
// Bearer, não dá pra apontar um <a href> direto pro endpoint — buscamos o blob
// autenticado e navegamos a aba pra ele. A janela é aberta ANTES do await pra
// não ser barrada por bloqueador de pop-up (precisa do gesto do clique).
async function abrirArquivoEmNovaAba(endpoint: string): Promise<void> {
  // Sem `noopener`: com ele o window.open devolve null e não dá pra navegar a
  // aba já aberta — sobraria uma guia about:blank órfã. O arquivo é do mesmo
  // domínio (blob:), então não há risco de reverse-tabnabbing aqui.
  const win = window.open('about:blank', '_blank');
  try {
    const blob = await request<Blob>(endpoint, { responseType: 'blob' });
    const url = URL.createObjectURL(blob);
    if (win) {
      win.location.href = url;
    } else {
      // Pop-up bloqueado: abre na mesma aba como fallback.
      window.open(url, '_blank');
    }
  } catch (err) {
    win?.close();
    throw err;
  }
}

export function viewCertidaoArquivo(certidaoId: string): Promise<void> {
  return abrirArquivoEmNovaAba(
    `/company-profile/certidoes/${certidaoId}/arquivo`,
  );
}

export function viewAtestadoArquivo(atestadoId: string): Promise<void> {
  return abrirArquivoEmNovaAba(
    `/company-profile/atestados/${atestadoId}/arquivo`,
  );
}

// ---- arquivo (PDF) da CAT do atestado (T-134) — espelha as fns de certidão ----

export function uploadAtestadoArquivo(
  atestadoId: string,
  file: File,
): Promise<ArquivoMeta> {
  const form = new FormData();
  form.append('arquivo', file);
  return request<ArquivoMeta>(
    `/company-profile/atestados/${atestadoId}/arquivo`,
    { method: 'POST', body: form },
  );
}

export function removeAtestadoArquivo(atestadoId: string): Promise<void> {
  return request<void>(`/company-profile/atestados/${atestadoId}/arquivo`, {
    method: 'DELETE',
  });
}

/** Baixa o PDF da CAT do atestado (com auth) e dispara o download no browser. */
export async function downloadAtestadoArquivo(
  atestadoId: string,
  nomeArquivo: string,
): Promise<void> {
  const blob = await request<Blob>(
    `/company-profile/atestados/${atestadoId}/arquivo`,
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

// ---- alertas / central de notificações (T-90) ----

export function getAlertas(signal?: AbortSignal): Promise<AlertasResult> {
  return request<AlertasResult>('/alertas', { signal });
}

export function marcarAlertasLido(): Promise<void> {
  return request<void>('/alertas/marcar-lido', { method: 'POST' });
}

// ---- agenda de prazos (T-91) ----

export function getAgenda(
  signal?: AbortSignal,
): Promise<{ data: AgendaEvento[] }> {
  return request<{ data: AgendaEvento[] }>('/agenda', { signal });
}

// ---- propostas / orçamentos (T-60/T-61) ----

export function getPropostas(
  signal?: AbortSignal,
): Promise<PropostaListItem[]> {
  return request<PropostaListItem[]>('/propostas', { signal });
}

// Propostas vinculadas a um edital específico (T-71) — mais recentes primeiro.
export function getPropostasDoEdital(
  editalId: string,
  signal?: AbortSignal,
): Promise<PropostaListItem[]> {
  return request<PropostaListItem[]>(`/propostas?editalId=${editalId}`, {
    signal,
  });
}

export function getProposta(
  id: string,
  signal?: AbortSignal,
): Promise<PropostaDetail> {
  return request<PropostaDetail>(`/propostas/${id}`, { signal });
}

export function createProposta(input: CreatePropostaInput): Promise<Proposta> {
  return request<Proposta>('/propostas', { method: 'POST', body: input });
}

export function deleteProposta(id: string): Promise<void> {
  return request<void>(`/propostas/${id}`, { method: 'DELETE' });
}

// Edita a proposta (título/status/BDI/teto) — usado pelo editor (T-68).
export function updateProposta(
  id: string,
  input: {
    titulo?: string;
    status?: PropostaStatus;
    bdiPercentual?: number;
    valorReferencia?: number;
    cronograma?: { descricao: string; percentual: number }[];
  },
): Promise<Proposta> {
  return request<Proposta>(`/propostas/${id}`, { method: 'PUT', body: input });
}

// ---- itens da proposta (T-61/T-64/T-65) ----

export function addPropostaItem(
  propostaId: string,
  input: CreatePropostaItemInput,
): Promise<PropostaItem> {
  return request<PropostaItem>(`/propostas/${propostaId}/itens`, {
    method: 'POST',
    body: input,
  });
}

export function updatePropostaItem(
  propostaId: string,
  itemId: string,
  input: UpdatePropostaItemInput,
): Promise<PropostaItem> {
  return request<PropostaItem>(`/propostas/${propostaId}/itens/${itemId}`, {
    method: 'PUT',
    body: input,
  });
}

export function deletePropostaItem(
  propostaId: string,
  itemId: string,
): Promise<void> {
  return request<void>(`/propostas/${propostaId}/itens/${itemId}`, {
    method: 'DELETE',
  });
}

// Importa os itens da planilha do edital por IA (T-64). Pode demorar na 1ª vez.
export function importarItensDoEdital(
  propostaId: string,
): Promise<ImportarItensResponse> {
  return request<ImportarItensResponse>(
    `/propostas/${propostaId}/itens/importar`,
    { method: 'POST' },
  );
}

// Inclusão em lote — colar de uma planilha (T-65).
export function addPropostaItensBulk(
  propostaId: string,
  itens: CreatePropostaItemInput[],
): Promise<PropostaDetail> {
  return request<PropostaDetail>(`/propostas/${propostaId}/itens/bulk`, {
    method: 'POST',
    body: { itens },
  });
}

// Baixa a proposta em CSV (T-70) e dispara o download no browser.
export async function downloadPropostaCsv(
  id: string,
  filename = 'proposta.csv',
): Promise<void> {
  const blob = await request<Blob>(`/propostas/${id}/export.csv`, {
    responseType: 'blob',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// ---- admin (Épico 15) ----

// Trilha de auditoria do backoffice (T-182). Só ADMIN — o backend responde 404 a
// qualquer outro.
export function getAuditLog(filtro: AuditFilter): Promise<AdminAuditPage> {
  return request<AdminAuditPage>(`/admin/audit${montarQueryAuditoria(filtro)}`);
}

// Home do admin (T-194): números do negócio.
export function getAdminDashboard(): Promise<ResumoAdmin> {
  return request<ResumoAdmin>('/admin/dashboard');
}

// Painel de captação e jobs (T-188).
export function getAdminCaptacao(): Promise<PainelCaptacao> {
  return request<PainelCaptacao>('/admin/captacao');
}

export function rodarCaptacao(): Promise<DisparoResposta> {
  return request<DisparoResposta>('/admin/captacao/run', { method: 'POST' });
}

export function rodarNotificacoes(): Promise<DisparoResposta> {
  return request<DisparoResposta>('/admin/captacao/notificacoes/run', {
    method: 'POST',
  });
}

// Painel de buscas (T-199): o que buscam e o que dá zero.
export function getAdminBuscas(
  periodo: { desde?: string; ate?: string } = {},
): Promise<ResumoBuscas> {
  const sp = new URLSearchParams();
  if (periodo.desde) sp.set('desde', periodo.desde);
  if (periodo.ate) sp.set('ate', periodo.ate);
  const qs = sp.toString();
  return request<ResumoBuscas>(`/admin/buscas${qs ? `?${qs}` : ''}`);
}

// Conferência de saídas de IA (T-200).
export function getAdminIaOutputs(opts: {
  tipo?: TipoSaidaIa;
  page?: number;
}): Promise<IaOutputsPagina> {
  const sp = new URLSearchParams();
  if (opts.tipo) sp.set('tipo', opts.tipo);
  if (opts.page != null) sp.set('page', String(opts.page));
  const qs = sp.toString();
  return request<IaOutputsPagina>(`/admin/ia-outputs${qs ? `?${qs}` : ''}`);
}

export function marcarIaOutput(dados: {
  tipo: TipoSaidaIa;
  editalId: string;
  veredito: 'ok' | 'errado';
}): Promise<void> {
  return request<void>('/admin/ia-outputs/review', {
    method: 'POST',
    body: dados,
  });
}

// Saúde das integrações + sanidade de env (T-201).
export function getAdminSaude(): Promise<SaudeIntegracoes> {
  return request<SaudeIntegracoes>('/admin/saude');
}

// Feedback in-app (T-202).
export function reportarProblema(dados: {
  mensagem: string;
  rota?: string;
  versao?: string;
}): Promise<void> {
  return request<void>('/feedback', { method: 'POST', body: dados });
}

export function getAdminFeedback(opts: {
  status?: FeedbackStatus;
  page?: number;
}): Promise<FeedbackPagina> {
  const sp = new URLSearchParams();
  if (opts.status) sp.set('status', opts.status);
  if (opts.page != null) sp.set('page', String(opts.page));
  const qs = sp.toString();
  return request<FeedbackPagina>(`/admin/feedback${qs ? `?${qs}` : ''}`);
}

export function atualizarStatusFeedback(
  id: string,
  status: FeedbackStatus,
): Promise<void> {
  return request<void>(`/admin/feedback/${id}/status`, {
    method: 'PATCH',
    body: { status },
  });
}

// Contas do beta (T-184). Só ADMIN — o backend responde 404 a qualquer outro.
export function getAdminContas(filtro: AccountsFilter): Promise<AccountsPage> {
  return request<AccountsPage>(`/admin/accounts${montarQueryContas(filtro)}`);
}

export function getAdminConta(id: string): Promise<AccountDetail> {
  return request<AccountDetail>(`/admin/accounts/${id}`);
}

// Ações de conta (T-185). Todas mutam e devolvem o detalhe atualizado; o backend
// audita cada uma (@Audit).
export function estenderTrialConta(
  id: string,
  dias: number,
): Promise<AccountDetail> {
  return request<AccountDetail>(`/admin/accounts/${id}/estender-trial`, {
    method: 'POST',
    body: { dias },
  });
}

export function concederCortesia(
  id: string,
  dias: number,
): Promise<AccountDetail> {
  return request<AccountDetail>(`/admin/accounts/${id}/cortesia`, {
    method: 'POST',
    body: { dias },
  });
}

export function revogarCortesia(id: string): Promise<AccountDetail> {
  return request<AccountDetail>(`/admin/accounts/${id}/cortesia`, {
    method: 'DELETE',
  });
}

export function suspenderConta(id: string): Promise<AccountDetail> {
  return request<AccountDetail>(`/admin/accounts/${id}/suspender`, {
    method: 'POST',
  });
}

export function reativarConta(id: string): Promise<AccountDetail> {
  return request<AccountDetail>(`/admin/accounts/${id}/reativar`, {
    method: 'POST',
  });
}

export function reenviarVerificacaoConta(id: string): Promise<AccountDetail> {
  return request<AccountDetail>(
    `/admin/accounts/${id}/reenviar-verificacao`,
    { method: 'POST' },
  );
}

export function revogarSessoesConta(id: string): Promise<AccountDetail> {
  return request<AccountDetail>(`/admin/accounts/${id}/revogar-sessoes`, {
    method: 'POST',
  });
}

export { API_URL };
