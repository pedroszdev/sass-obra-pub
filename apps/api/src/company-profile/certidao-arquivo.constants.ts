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
