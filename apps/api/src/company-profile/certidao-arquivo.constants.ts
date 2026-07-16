// Forma mínima do arquivo entregue pelo multer (via FileInterceptor do
// @nestjs/platform-express). Tipado à mão para não depender de @types/multer.
export interface UploadedPdf {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

// Tipos aceitos no cofre: PDF e imagens (foto/scan da certidão).
export const ARQUIVO_MIMES_PERMITIDOS = [
  'application/pdf',
  'image/jpeg',
  'image/png',
];

// Teto de 10 MB (mesmo limite mostrado na UI). Reforçado também no
// FileInterceptor; aqui garante a mensagem de erro amigável.
export const ARQUIVO_TAMANHO_MAX = 10 * 1024 * 1024;

// Tamanho da coluna `nome_arquivo` nas duas entidades de arquivo (certidão e
// atestado).
export const NOME_ARQUIVO_MAX = 255;

// O nome vem do CLIENTE (multer só repassa o `filename` do multipart) e vai
// direto para um varchar(255). Sem cortar, um nome mais longo estoura a coluna e
// o upload morre em 500 — erro de servidor no que é, na verdade, entrada
// inválida. Mesmo cuidado do clamp da T-118a no mapper do PNCP.
//
// Cortar (em vez de recusar) porque o nome é rótulo, não dado: truncá-lo entrega
// o upload, e recusar por causa do rótulo seria pior para quem só quer guardar a
// certidão. Nome vazio vira um marcador — a coluna é NOT NULL.
export function clampNomeArquivo(nome: string): string {
  const limpo = nome.trim();
  if (!limpo) return 'arquivo';
  return limpo.length > NOME_ARQUIVO_MAX
    ? limpo.slice(0, NOME_ARQUIVO_MAX)
    : limpo;
}

// Detecta o tipo pelo CONTEÚDO (magic bytes), não pelo mimetype declarado —
// que é contornável por curl (T-119e). Retorna o mime real ou null se o começo
// do arquivo não bate com nenhum tipo aceito.
export function detectarMimePorConteudo(buffer: Buffer): string | null {
  if (
    buffer.length >= 5 &&
    buffer.subarray(0, 5).toString('latin1') === '%PDF-'
  ) {
    return 'application/pdf';
  }
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }
  return null;
}
