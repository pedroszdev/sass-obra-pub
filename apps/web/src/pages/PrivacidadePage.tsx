import { LegalPage, type LegalSecao } from './LegalPage';
import { ATUALIZADO_EM, EMPRESA, SUBPROCESSADORES } from './legal-empresa';

// Política de Privacidade (T-102/LGPD, texto definitivo na T-179).
//
// 🔴 O que estava FALTANDO e foi acrescentado, porque a LGPD exige e a ausência
// não era escolha, era esquecimento:
//   - identificação do CONTROLADOR (art. 9º, I) — o texto não dizia quem trata;
//   - lista de SUBPROCESSADORES (art. 9º, III) — só a OpenAI era citada, e há
//     sete terceiros vendo dado;
//   - TRANSFERÊNCIA INTERNACIONAL (art. 33) — a maioria fica fora do Brasil, e
//     isso precisa ser dito, não presumido;
//   - cookies, que não apareciam em lugar nenhum.
//
// ⚠️ E o que estava ERRADO: o texto de reembolso dizia "primeira cobrança" e
// "não fazemos reembolso" fora do prazo — diverge do que o sistema faz (conta da
// cobrança mais recente, e fora do prazo o pedido é analisado). Texto publicado
// que diverge do código é promessa quebrada numa das duas direções. O contrato
// comercial saiu daqui e foi para os Termos, que é o lugar dele.
const SECOES: LegalSecao[] = [
  {
    titulo: '1. Quem é o controlador',
    paragrafos: [
      `${EMPRESA.razaoSocial}, CNPJ ${EMPRESA.cnpj}, com sede em ${EMPRESA.endereco}, é a controladora dos dados pessoais tratados no PrumoLicita.`,
      `Para exercer seus direitos ou tirar dúvidas sobre privacidade: ${EMPRESA.email}.`,
    ],
  },
  {
    titulo: '2. Quais dados coletamos',
    paragrafos: [
      'Dados de conta: nome, e-mail e senha (guardada apenas como hash, nunca em texto legível). Se você entra com o Google, recebemos dele seu nome, e-mail e um identificador — não temos acesso à sua senha do Google.',
      'Dados da empresa: CNPJ, razão social, porte, telefone, capital social, patrimônio líquido, registro no conselho (CREA/CAU) e UF/municípios de atuação.',
      'Documentos de habilitação: certidões e atestados/CAT que você anexa, inclusive os arquivos em PDF ou imagem.',
      'Dados de cobrança: quando você assina, coletamos os dados necessários à emissão da cobrança (CNPJ, endereço e telefone do titular). Dados de cartão são transmitidos ao processador de pagamento e não são armazenados por nós — guardamos apenas os quatro últimos dígitos e a bandeira, para você identificar o cartão na tela.',
      'Dados de uso: editais salvos, propostas, buscas, preferências de notificação, além de registros técnicos como endereço IP e data/hora de acesso, usados para segurança e para limitar abuso.',
    ],
  },
  {
    titulo: '3. Para que usamos',
    paragrafos: [
      'Para prestar o serviço: encontrar editais da sua região, diagnosticar sua prontidão, resumir editais e ajudar a montar propostas. Os documentos anexados são reaproveitados no diagnóstico de cada edital.',
      'Para cobrar a assinatura, emitir documento fiscal e comunicar o que diz respeito à sua conta (verificação de e-mail, avisos de cobrança, vencimento de certidão).',
      'Para segurança: detectar e conter abuso, e investigar incidentes.',
      'Não vendemos seus dados e não os usamos para publicidade de terceiros.',
    ],
  },
  {
    titulo: '4. Base legal',
    paragrafos: [
      'Execução do contrato, para tudo que é necessário à prestação do serviço e à cobrança. Cumprimento de obrigação legal, para dados fiscais e contábeis. Legítimo interesse, para segurança da plataforma e prevenção a fraude.',
      'Consentimento, apenas para as comunicações opcionais (como o e-mail diário de obras da sua região), que você pode desligar a qualquer momento nas preferências ou pelo link de descadastro no próprio e-mail.',
    ],
  },
  {
    titulo: '5. Com quem compartilhamos',
    paragrafos: [
      'Usamos serviços de terceiros que tratam dados a nosso mando, apenas no necessário para operar a plataforma:',
      ...SUBPROCESSADORES.map(
        (s) => `• ${s.nome} — ${s.papel} (${s.local}).`,
      ),
      'Também podemos compartilhar dados quando exigido por lei ou por ordem de autoridade competente.',
    ],
  },
  {
    titulo: '6. Transferência internacional',
    paragrafos: [
      'Parte desses serviços é operada fora do Brasil, conforme indicado acima. Nesses casos, a transferência ocorre para viabilizar a execução do contrato e é feita com fornecedores que adotam medidas de proteção compatíveis com a LGPD.',
    ],
  },
  {
    titulo: '7. Inteligência artificial',
    paragrafos: [
      'Trechos do texto de editais são enviados a um provedor de IA (OpenAI) para gerar resumos, extrair exigências de habilitação e ler planilhas de preço.',
      'Os documentos do seu cofre (certidões e atestados) não são enviados para treinar modelos de terceiros. O conteúdo enviado é o do edital, que é público.',
    ],
  },
  {
    titulo: '8. Cookies',
    paragrafos: [
      'Usamos cookies estritamente necessários para manter você conectado com segurança. Eles não são acessíveis por scripts da página e não servem para publicidade ou rastreamento entre sites.',
      'Nosso provedor de rede também pode usar cookies técnicos para proteger a aplicação contra abuso.',
    ],
  },
  {
    titulo: '9. Seus direitos',
    paragrafos: [
      'A LGPD garante a você confirmação do tratamento, acesso, correção, portabilidade, anonimização, eliminação e informação sobre compartilhamento.',
      'Na prática: você pode acessar e exportar todos os seus dados em Configurações › Segurança › Exportar meus dados, e excluir sua conta em Configurações › Segurança › Excluir minha conta.',
      'A exclusão remove cadastro, perfil da empresa, certidões, atestados, propostas, favoritos e arquivos anexados. É definitiva.',
      `Para os demais direitos, escreva para ${EMPRESA.email}. Respondemos em até 15 dias.`,
    ],
  },
  {
    titulo: '10. Por quanto tempo guardamos',
    paragrafos: [
      'Enquanto sua conta existir, mantemos os dados necessários para prestar o serviço.',
      'Se você cancelar, mantém o acesso até o fim do período já pago. Depois que o acesso termina, seus dados ficam guardados por 90 dias, caso queira voltar; após esse prazo, a conta e os dados associados podem ser removidos.',
      'Registros de cobrança e documentos fiscais são mantidos pelo prazo exigido pela legislação, mesmo após a exclusão da conta.',
      'Editais captados de fontes públicas são descartados quando encerrados há mais de 90 dias, exceto os vinculados a alguma proposta ou obra salva sua.',
    ],
  },
  {
    titulo: '11. Segurança',
    paragrafos: [
      'As senhas são guardadas como hash. O acesso é protegido por autenticação, limites de requisição e proteção contra automação abusiva. Os arquivos que você envia ficam restritos à sua conta.',
      'Nenhum sistema é infalível. Se ocorrer incidente de segurança relevante que possa causar risco a você, comunicaremos você e a Autoridade Nacional de Proteção de Dados, nos termos da lei.',
    ],
  },
  {
    titulo: '12. Alterações desta Política',
    paragrafos: [
      'Podemos atualizar esta Política. Quando a mudança for relevante, avisaremos ao entrar na plataforma, e a data de atualização no topo desta página é alterada.',
    ],
  },
];

export function PrivacidadePage() {
  return (
    <LegalPage
      titulo="Política de Privacidade"
      atualizadoEm={ATUALIZADO_EM}
      secoes={SECOES}
    />
  );
}
