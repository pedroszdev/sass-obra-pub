import { execFile } from 'node:child_process';
import { mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';
import { Injectable, Logger } from '@nestjs/common';

const execFileP = promisify(execFile);

const DOWNLOAD_TIMEOUT_MS = 60000;
// Teto do download (T-104): sem isto, um edital com projeto executivo gigante
// bufferiza inteiro na memória e derruba o free tier (512 MB) por OOM. O irmão
// planilha-texto.service.ts já faz o mesmo. Edital costuma ter dezenas de MB.
const MAX_DOWNLOAD_BYTES = 60 * 1024 * 1024;
const MAX_BUFFER = 128 * 1024 * 1024; // teto da saída do pdftotext

const ehPdf = (b: Buffer): boolean =>
  b.length >= 4 && b.toString('latin1', 0, 4) === '%PDF';
const ehZip = (b: Buffer): boolean =>
  b.length >= 4 &&
  b[0] === 0x50 &&
  b[1] === 0x4b &&
  b[2] === 0x03 &&
  b[3] === 0x04;

// Extrai texto de um documento de edital (PDF direto ou PDF dentro de ZIP).
// Usa ferramentas de sistema (pdftotext/unzip do poppler — ver Dockerfile);
// fonte-agnóstico (a URL/seleção é responsabilidade do conector — §3.1).
@Injectable()
export class DocumentoTextoService {
  private readonly logger = new Logger(DocumentoTextoService.name);

  // Baixa a URL e devolve o texto extraído, ou null se não for um PDF útil.
  async extrairDeUrl(url: string): Promise<string | null> {
    const resp = await fetch(url, {
      headers: { Accept: '*/*' },
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
    if (!resp.ok) {
      throw new Error(`Falha ao baixar documento: HTTP ${resp.status}`);
    }
    // Corta pelo Content-Length antes de bufferizar (o caminho barato), e de novo
    // pelo tamanho real (o header pode mentir/faltar) — não extrai o gigante.
    const declarado = Number(resp.headers.get('content-length') ?? 0);
    if (declarado > MAX_DOWNLOAD_BYTES) {
      this.logger.warn(
        `Documento grande demais (${declarado} bytes, teto ${MAX_DOWNLOAD_BYTES}); ignorado.`,
      );
      return null;
    }
    const buffer = Buffer.from(await resp.arrayBuffer());
    if (buffer.length > MAX_DOWNLOAD_BYTES) {
      this.logger.warn(
        `Documento grande demais (${buffer.length} bytes, teto ${MAX_DOWNLOAD_BYTES}); ignorado.`,
      );
      return null;
    }
    return this.extrairDeBuffer(buffer);
  }

  async extrairDeBuffer(buffer: Buffer): Promise<string | null> {
    const dir = await mkdtemp(join(tmpdir(), 'obrapub-edital-'));
    try {
      const pdf = await this.resolverPdf(buffer, dir);
      if (!pdf) return null;
      const { stdout } = await execFileP('pdftotext', ['-q', pdf, '-'], {
        maxBuffer: MAX_BUFFER,
      });
      return stdout.replace(/\n{3,}/g, '\n\n').trim();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  // Devolve o caminho de um PDF analisável (direto ou extraído do ZIP), ou null.
  private async resolverPdf(
    buffer: Buffer,
    dir: string,
  ): Promise<string | null> {
    if (ehPdf(buffer)) {
      const caminho = join(dir, 'doc.pdf');
      await writeFile(caminho, buffer);
      return caminho;
    }
    if (ehZip(buffer)) {
      const zip = join(dir, 'doc.zip');
      const dest = join(dir, 'unzip');
      await writeFile(zip, buffer);
      try {
        await execFileP('unzip', ['-o', '-qq', zip, '-d', dest]);
      } catch (error) {
        this.logger.warn(`ZIP corrompido/ilegível: ${String(error)}`);
        return null;
      }
      const pdfs = await this.listarPdfs(dest);
      return pdfs.length ? this.escolherPdfPrincipal(pdfs) : null;
    }
    return null; // outro formato (doc/xls/imagem) — sem texto extraível aqui
  }

  private async listarPdfs(dir: string): Promise<string[]> {
    const out: string[] = [];
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) out.push(...(await this.listarPdfs(p)));
      else if (/\.pdf$/i.test(e.name)) out.push(p);
    }
    return out;
  }

  // Dentro do ZIP, prioriza o PDF cujo nome diz "edital"; senão o maior.
  private async escolherPdfPrincipal(pdfs: string[]): Promise<string | null> {
    const edital = pdfs.find((p) => /edital/i.test(basename(p)));
    if (edital) return edital;
    const comTamanho = await Promise.all(
      pdfs.map(async (p) => ({ p, size: (await stat(p)).size })),
    );
    comTamanho.sort((a, b) => b.size - a.size);
    return comTamanho[0]?.p ?? null;
  }
}
