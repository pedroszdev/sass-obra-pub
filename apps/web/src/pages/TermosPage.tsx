import { LegalPage, type LegalSecao } from './LegalPage';
import { ATUALIZADO_EM, EMPRESA } from './legal-empresa';

// Termos de Uso (T-102, texto definitivo na T-179).
//
// 🔴 **Cada afirmação aqui descreve o que o sistema FAZ, e foi conferida contra
// o código.** Termo que promete o que o produto não entrega é pior que termo
// ausente: vira prova documental contra nós. As seções de assinatura,
// cancelamento e reembolso são novas — antes o contrato comercial simplesmente
// não estava escrito, e parte dele morava, fora de lugar, na Privacidade.
//
// ⚠️ Ao mudar o texto, suba a `terms_version` no /admin (T-196) para forçar o
// re-aceite. Alterar em silêncio deixa gente vinculada a um texto que nunca viu.
const SECOES: LegalSecao[] = [
  {
    titulo: '1. Quem somos',
    paragrafos: [
      `O PrumoLicita é operado por ${EMPRESA.razaoSocial}, inscrita no CNPJ ${EMPRESA.cnpj}, com sede em ${EMPRESA.endereco} ("nós").`,
      `Ao criar uma conta e usar o serviço, você concorda com estes Termos de Uso e com a Política de Privacidade. Dúvidas: ${EMPRESA.email}.`,
    ],
  },
  {
    titulo: '2. O que é o serviço',
    paragrafos: [
      'O PrumoLicita ajuda o empreiteiro de obra pública a encontrar licitações relevantes para a sua região, verificar se está apto a participar, entender o edital e montar a proposta de preço.',
      'O serviço é destinado a pessoas jurídicas. Cada CNPJ corresponde a uma conta.',
    ],
  },
  {
    titulo: '3. Sua conta',
    paragrafos: [
      'Você é responsável por manter a confidencialidade da sua senha e por toda atividade na sua conta. Os dados que você informa (empresa, certidões, atestados) devem ser verdadeiros e de sua titularidade.',
      'Podemos suspender ou encerrar contas que violem estes Termos, que informem dados falsos ou que sejam usadas para fins ilícitos.',
    ],
  },
  {
    titulo: '4. Teste grátis, planos e cobrança',
    paragrafos: [
      'Novas contas começam com 7 dias de teste grátis, sem necessidade de cartão. Terminado o teste, é preciso assinar para continuar usando.',
      'Oferecemos planos mensal e anual. O valor vigente é sempre o exibido na tela de assinatura no momento da contratação. Podemos alterar preços, e a alteração vale para as cobranças seguintes — nunca retroage a uma já emitida.',
      'A cobrança é processada pelo Asaas. Você pode pagar com cartão de crédito, boleto ou Pix. No cartão, a renovação é automática. No boleto e no Pix, cada ciclo gera uma cobrança que precisa ser paga por você — não há débito automático.',
      'Assinantes anuais recebem aviso por e-mail antes de cada renovação. Quem paga por boleto ou Pix recebe aviso antes do vencimento.',
    ],
  },
  {
    titulo: '5. Atraso no pagamento',
    paragrafos: [
      'Se uma cobrança não for paga no vencimento, avisamos por e-mail e o acesso continua por mais 7 dias. Nesse período enviamos um aviso adicional informando a data em que o acesso será interrompido.',
      'Passado esse prazo sem pagamento, o acesso é suspenso. Seus dados continuam guardados, e o pagamento restabelece o acesso automaticamente.',
    ],
  },
  {
    titulo: '6. Cancelamento',
    paragrafos: [
      'Você pode cancelar quando quiser, sem multa nem taxa. O cancelamento não interrompe o acesso na hora: você continua usando até o fim do período já pago, e não há nova cobrança depois disso.',
      'Suas propostas, documentos e obras salvas permanecem guardados pelo prazo descrito na Política de Privacidade, caso você queira voltar.',
    ],
  },
  {
    titulo: '7. Reembolso',
    paragrafos: [
      `Nos termos do art. 49 do Código de Defesa do Consumidor, você pode desistir da contratação em até 7 dias contados do pagamento e receber a devolução integral do valor. Para isso, escreva para ${EMPRESA.email}.`,
      'A devolução é feita pelo mesmo meio de pagamento utilizado. No cartão de crédito, o estorno pode levar até duas faturas para aparecer, conforme o prazo do emissor. Quando a devolução é confirmada, o acesso ao serviço é encerrado.',
      'Pedidos feitos fora desse prazo são analisados caso a caso e não são garantidos.',
    ],
  },
  {
    titulo: '8. Editais, inteligência artificial e limites do serviço',
    paragrafos: [
      'Os editais são captados de fontes públicas, como o Portal Nacional de Contratações Públicas (PNCP). Não somos responsáveis pela disponibilidade, pelo conteúdo ou pela correção dessas fontes.',
      'Resumos, diagnósticos de prontidão e extrações de planilha são gerados de forma automatizada, inclusive por inteligência artificial, e podem conter erros. São apoio à decisão e não substituem a leitura do edital oficial na fonte.',
      'A responsabilidade por decidir participar de uma licitação, cumprir prazos, apresentar documentos e conferir valores é sua. Não garantimos que uma obra listada esteja vigente, que você esteja habilitado, nem qualquer resultado em certame.',
      'O serviço é fornecido no estado em que se encontra. Não respondemos por lucros cessantes, perda de oportunidade de negócio ou danos indiretos decorrentes do uso ou da indisponibilidade da plataforma.',
    ],
  },
  {
    titulo: '9. Uso aceitável',
    paragrafos: [
      'Você não deve tentar burlar limites técnicos, acessar contas de terceiros, extrair dados de forma automatizada em massa, revender o acesso, nem usar o serviço para finalidade ilícita.',
    ],
  },
  {
    titulo: '10. Encerramento da conta',
    paragrafos: [
      'Você pode excluir sua conta a qualquer momento em Configurações › Segurança, o que remove seus dados conforme a Política de Privacidade. A exclusão é definitiva e não é revertida.',
      'Podemos encerrar a prestação do serviço mediante aviso prévio razoável, devolvendo proporcionalmente o valor de período já pago e não utilizado.',
    ],
  },
  {
    titulo: '11. Alterações destes Termos',
    paragrafos: [
      'Podemos atualizar estes Termos. Quando a mudança for relevante, pediremos seu aceite novamente ao entrar na plataforma, e a data de atualização no topo desta página é alterada.',
      'Continuar usando o serviço após o aceite significa concordar com a versão vigente.',
    ],
  },
  {
    titulo: '12. Lei aplicável e foro',
    paragrafos: [
      `Estes Termos são regidos pela lei brasileira. Fica eleito o foro da comarca de ${EMPRESA.foro} para dirimir controvérsias, sem prejuízo do foro do domicílio do consumidor quando aplicável.`,
    ],
  },
  {
    titulo: '13. Contato',
    paragrafos: [
      `Dúvidas sobre estes Termos, sobre a assinatura ou pedidos de reembolso: ${EMPRESA.email}.`,
    ],
  },
];

export function TermosPage() {
  return (
    <LegalPage
      titulo="Termos de Uso"
      atualizadoEm={ATUALIZADO_EM}
      secoes={SECOES}
    />
  );
}
