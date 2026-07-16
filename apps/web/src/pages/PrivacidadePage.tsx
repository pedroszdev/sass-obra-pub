import { LegalPage, type LegalSecao } from './LegalPage';

// Política de Privacidade (T-102/LGPD). Conteúdo é RASCUNHO — revisão jurídica
// do dono pendente. Reflete o que o produto de fato coleta e os direitos LGPD.
const SECOES: LegalSecao[] = [
  {
    titulo: '1. Quais dados coletamos',
    paragrafos: [
      'Dados de conta: e-mail, nome e senha (guardada apenas como hash). Dados da empresa: CNPJ, porte, razão social, telefone, capital social, registro no conselho (CREA/CAU) e UF/municípios de atuação.',
      'Documentos de habilitação: certidões (fiscais, trabalhistas) e atestados/CAT que você anexa — inclusive os arquivos em PDF/imagem. Atividade: editais salvos, propostas e preferências de notificação.',
    ],
  },
  {
    titulo: '2. Para que usamos',
    paragrafos: [
      'Para prestar o serviço: achar editais da sua região, diagnosticar sua prontidão, resumir editais e ajudar a montar propostas. Os documentos anexados são reaproveitados no diagnóstico de cada edital.',
      'Não vendemos seus dados. Trechos de editais podem ser enviados a um provedor de IA (OpenAI) para gerar resumos e extrações; documentos do seu cofre não são usados para treinar modelos de terceiros.',
    ],
  },
  {
    titulo: '3. Base legal e consentimento',
    paragrafos: [
      'O tratamento se dá para a execução do contrato (prestação do serviço) e mediante o seu consentimento, coletado no cadastro. Você pode retirar o consentimento excluindo a conta.',
    ],
  },
  {
    titulo: '4. Seus direitos (LGPD)',
    paragrafos: [
      'Você pode acessar e exportar todos os seus dados a qualquer momento (Configurações › Segurança › Exportar meus dados) e excluir sua conta e os dados associados (Configurações › Segurança › Excluir minha conta).',
      'A exclusão remove seu cadastro, perfil, certidões, atestados, propostas, favoritos e arquivos anexados.',
    ],
  },
  {
    titulo: '5. Retenção e segurança',
    paragrafos: [
      'Guardamos seus dados enquanto a conta existir. As senhas são armazenadas como hash; o acesso é protegido por autenticação e limites de requisição. Ao excluir a conta, os dados são removidos.',
      'Se você cancelar a assinatura, mantém o acesso até o fim do período já pago — não há corte imediato nem cobrança pelo tempo restante. Depois que o acesso termina, seus dados ficam guardados por 90 dias, caso você queira voltar; após esse prazo, a conta e os dados associados são removidos.',
      'Reembolso: você pode pedir a devolução integral em até 7 dias da sua primeira cobrança, pelo nosso suporte — o acesso é encerrado junto com a devolução. Depois desse prazo, e nas cobranças de renovação, não fazemos reembolso; nesses casos você pode cancelar quando quiser e continua usando até o fim do período já pago. Antes de qualquer cobrança você tem 7 dias de teste grátis, sem cartão. Assinantes anuais recebem um aviso por e-mail alguns dias antes de cada renovação.',
    ],
  },
  {
    titulo: '6. Contato do controlador',
    paragrafos: [
      'Para exercer seus direitos ou tirar dúvidas sobre privacidade, use o canal de suporte (a ser publicado).',
    ],
  },
];

export function PrivacidadePage() {
  return (
    <LegalPage
      titulo="Política de Privacidade"
      atualizadoEm="julho de 2026"
      secoes={SECOES}
    />
  );
}
