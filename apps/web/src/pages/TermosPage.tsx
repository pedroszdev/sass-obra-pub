import { LegalPage, type LegalSecao } from './LegalPage';

// Termos de Uso (T-102). Conteúdo é RASCUNHO — revisão jurídica do dono pendente.
const SECOES: LegalSecao[] = [
  {
    titulo: '1. O que é o PrumoLicita',
    paragrafos: [
      'O PrumoLicita é uma plataforma que ajuda o empreiteiro de obra pública a encontrar licitações relevantes para a sua região, verificar se está apto a participar, entender o edital e montar a proposta de preço.',
      'Ao criar uma conta e usar o serviço, você concorda com estes Termos de Uso e com a Política de Privacidade.',
    ],
  },
  {
    titulo: '2. Sua conta',
    paragrafos: [
      'Você é responsável por manter a confidencialidade da sua senha e por toda atividade na sua conta. Os dados que você informa (empresa, certidões, atestados) devem ser verdadeiros e de sua titularidade.',
    ],
  },
  {
    titulo: '3. Uso das informações de editais e da IA',
    paragrafos: [
      'Os editais são captados de fontes públicas (como o PNCP). Resumos, diagnósticos de prontidão e extrações são gerados de forma automatizada, inclusive por inteligência artificial, e podem conter erros — são apoio à decisão, não substituem a leitura do edital oficial na fonte.',
      'A responsabilidade por participar de uma licitação, cumprir prazos e apresentar documentos é sua.',
    ],
  },
  {
    titulo: '4. Limitação de responsabilidade',
    paragrafos: [
      'O PrumoLicita é fornecido "como está". Não garantimos que uma obra listada esteja apta, vigente ou correta em todos os detalhes, nem que você será habilitado ou vencedor de qualquer certame.',
    ],
  },
  {
    titulo: '5. Encerramento',
    paragrafos: [
      'Você pode excluir sua conta a qualquer momento nas configurações, o que remove os seus dados conforme a Política de Privacidade. Podemos suspender contas que violem estes Termos.',
    ],
  },
  {
    titulo: '6. Contato',
    paragrafos: [
      'Dúvidas sobre estes Termos podem ser enviadas ao nosso canal de suporte (a ser publicado).',
    ],
  },
];

export function TermosPage() {
  return (
    <LegalPage
      titulo="Termos de Uso"
      atualizadoEm="julho de 2026"
      secoes={SECOES}
    />
  );
}
