// Contrato do backoffice (Épico 15). Espelha apps/api/src/admin.

export interface AdminAuditEntry {
  id: string;
  adminUserId: string;
  action: string;
  method: string;
  path: string;
  targetId: string | null;
  statusCode: number;
  ip: string | null;
  summary: Record<string, unknown> | null;
  createdAt: string;
}

export interface AdminAuditPage {
  data: AdminAuditEntry[];
  total: number;
  page: number;
  pageSize: number;
}

// Filtro da consulta de auditoria (T-182). Datas em ISO (o backend aceita
// data ou data-hora).
export interface AuditFilter {
  desde?: string;
  ate?: string;
  acao?: string;
  page?: number;
  pageSize?: number;
}

// ---- Contas (T-184) ----

export type AssinaturaStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled';

export interface AccountRow {
  id: string;
  email: string;
  name: string;
  cnpj: string | null;
  porte: string | null;
  role: string;
  emailVerificado: boolean;
  createdAt: string;
  assinatura: { status: AssinaturaStatus; plano: string } | null;
}

export interface AccountsPage {
  data: AccountRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AccountDetail extends AccountRow {
  termsAcceptedAt: string | null;
  googleVinculado: boolean;
  perfil: {
    razaoSocial: string | null;
    telefone: string | null;
    capitalSocial: number | null;
    patrimonioLiquido: number | null;
    registro: { tipo: string | null; numero: string | null; uf: string | null };
  } | null;
  assinaturaDetalhe: {
    status: AssinaturaStatus;
    plano: string;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    pastDueDesde: string | null;
    stripeCustomerId: string | null;
    cortesiaAte: string | null;
    suspensoEm: string | null;
  } | null;
  sessoes: { ativas: number; ultimoAcesso: string | null };
  uso: {
    favoritos: number;
    propostas: number;
    alertasEnviados: number;
    certidoes: number;
    atestados: number;
  };
}

// ---- Home / dashboard (T-194) ----

export interface TrialExpirando {
  id: string;
  email: string;
  trialEndsAt: string | null;
}

export interface ResumoAdmin {
  assinaturas: {
    pagantes: number;
    emTrial: number;
    pastDue: number;
    canceladas: number;
  };
  trialsExpirando: { total: number; contas: TrialExpirando[] };
  cadastros: { hoje: number; ultimos7d: number };
  produto: { editaisHoje: number; alertasHoje: number };
  geradoEm: string;
}

// ---- Captação e jobs (T-188) ----

export interface CaptacaoSaude {
  ultimoSucessoEm: string | null;
  horasDesde: number | null;
  saudavel: boolean;
}

export interface ExecucaoResumo {
  id: string;
  fonte: string;
  uf: string;
  mode: string;
  status: string;
  processed: number;
  created: number;
  obras: number;
  error: string | null;
  startedAt: string;
  durationMs: number;
}

export interface PainelCaptacao {
  saude: CaptacaoSaude;
  porConector: ExecucaoResumo[];
  recentes: ExecucaoResumo[];
  alertasPorDia: { dia: string; total: number }[];
}

export type DisparoResposta = { status: 'disparado' | 'em_execucao' };

// ---- Buscas (T-199) ----

export interface BuscaZerada {
  id: string;
  userId: string | null;
  termo: string | null;
  ufs: string[] | null;
  municipios: string[] | null;
  valorMin: number | null;
  valorMax: number | null;
  createdAt: string;
}

export interface ResumoBuscas {
  totalBuscas: number;
  semResultado: number;
  termosTop: { termo: string; total: number }[];
  ufsZeradasTop: { ufs: string; total: number }[];
  recentesZeradas: BuscaZerada[];
}

// ---- Saídas de IA (T-200) ----

export type TipoSaidaIa = 'resumo' | 'exigencias' | 'itens';

export interface IaOutputEntry {
  tipo: TipoSaidaIa;
  editalId: string;
  editalObjeto: string;
  municipio: string;
  modelo: string | null;
  custoUsd: number | null;
  createdAt: string;
  veredito: 'ok' | 'errado' | null;
}

export interface TaxaTipo {
  ok: number;
  errado: number;
}

export interface TaxaAcerto {
  geral: TaxaTipo;
  porTipo: Record<TipoSaidaIa, TaxaTipo>;
}

export interface IaOutputsPagina {
  data: IaOutputEntry[];
  total: number;
  page: number;
  pageSize: number;
  taxa: TaxaAcerto;
}

// ---- Saúde das integrações (T-201) ----

export interface IntegracaoStatus {
  nome: string;
  configurado: boolean;
  obrigatorio: boolean;
  degrada: string;
}

export interface EnvStatus {
  nome: string;
  grupo: string;
  presente: boolean;
  obrigatorioEmProd: boolean;
}

export interface SaudeIntegracoes {
  producao: boolean;
  integracoes: IntegracaoStatus[];
  envs: EnvStatus[];
}

// ---- Feedback (T-202) ----

export type FeedbackStatus = 'novo' | 'lido' | 'resolvido';

export interface FeedbackItem {
  id: string;
  userId: string;
  rota: string | null;
  versao: string | null;
  mensagem: string;
  status: FeedbackStatus;
  createdAt: string;
}

export interface FeedbackPagina {
  data: FeedbackItem[];
  total: number;
  page: number;
  pageSize: number;
}

// ---- Curadoria de edital (T-197) ----

export interface EditalCuradoria {
  id: string;
  objeto: string;
  municipio: string;
  uf: string;
  situacao: string | null;
  isObra: boolean;
  oculto: boolean;
  ia: {
    status: string | null;
    temResumo: boolean;
    temExigencias: boolean;
    modelo: string | null;
    atualizadoEm: string | null;
  };
}

export interface AccountsFilter {
  email?: string;
  cnpj?: string;
  status?: AssinaturaStatus;
  emailVerificado?: boolean;
  cadastradoDe?: string;
  cadastradoAte?: string;
  page?: number;
  pageSize?: number;
}
