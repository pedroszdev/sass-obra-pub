import { execFile } from 'node:child_process';
import {
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';
import { Injectable, Logger } from '@nestjs/common';
import { scorePlanilhaNome } from './planilha-select';

const execFileP = promisify(execFile);

const DOWNLOAD_TIMEOUT_MS = 60000;
const MAX_DOWNLOAD_BYTES = 40 * 1024 * 1024; // planilha não é gigante; pula projeto executivo
const MAX_BUFFER = 128 * 1024 * 1024;

export type PlanilhaFormato = 'pdf' | 'xlsx' | 'xls' | 'nenhum';

export interface PlanilhaTexto {
  formato: PlanilhaFormato;
  /** Texto extraído (PDF via pdftotext, XLSX via parser próprio). null se não extraível. */
  texto: string | null;
}

const ehPdf = (b: Buffer): boolean =>
  b.length >= 4 && b.toString('latin1', 0, 4) === '%PDF';
const ehZip = (b: Buffer): boolean =>
  b.length >= 4 &&
  b[0] === 0x50 &&
  b[1] === 0x4b &&
  (b[2] === 0x03 || b[2] === 0x05 || b[2] === 0x07);
const ehOle2 = (b: Buffer): boolean =>
  b.length >= 8 &&
  b[0] === 0xd0 &&
  b[1] === 0xcf &&
  b[2] === 0x11 &&
  b[3] === 0xe0 &&
  b[4] === 0xa1 &&
  b[5] === 0xb1 &&
  b[6] === 0x1a &&
  b[7] === 0xe1;

function decodeXml(s: string): string {
  return (s ?? '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) =>
      String.fromCodePoint(parseInt(h, 16)),
    )
    .replace(/&amp;/g, '&');
}

function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  for (const m of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    const textos = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(
      (t) => t[1],
    );
    out.push(decodeXml(textos.join('')));
  }
  return out;
}

function sheetParaTexto(xml: string, shared: string[]): string {
  const linhas: string[] = [];
  for (const row of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const celulas: string[] = [];
    for (const c of row[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = c[1];
      const inner = c[2];
      const t = /t="([^"]+)"/.exec(attrs)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      let valor = '';
      if (t === 's') valor = shared[Number(v)] ?? '';
      else if (t === 'inlineStr')
        valor = decodeXml(
          [...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
            .map((x) => x[1])
            .join(''),
        );
      else if (v != null) valor = decodeXml(v);
      if (valor !== '') celulas.push(valor);
    }
    if (celulas.length) linhas.push(celulas.join('\t'));
  }
  return linhas.join('\n');
}

// Extrai a planilha orçamentária de um documento (T-64). PDF via pdftotext;
// XLSX via parser em Node puro (unzip + XML); ZIP de anexos: escolhe a melhor
// planilha interna pelo nome; .xls binário (OLE2) não é extraído (cai no manual).
// Reusa pdftotext/unzip do sistema (poppler — ver Dockerfile), como o T-47.
@Injectable()
export class PlanilhaTextoService {
  private readonly logger = new Logger(PlanilhaTextoService.name);

  async extrairDeUrl(url: string): Promise<PlanilhaTexto> {
    const resp = await fetch(url, {
      headers: { Accept: '*/*' },
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
    if (!resp.ok) {
      throw new Error(`Falha ao baixar planilha: HTTP ${resp.status}`);
    }
    const len = Number(resp.headers.get('content-length') ?? 0);
    if (len > MAX_DOWNLOAD_BYTES) {
      return { formato: 'nenhum', texto: null }; // grande demais p/ ser planilha
    }
    const buffer = Buffer.from(await resp.arrayBuffer());
    if (buffer.length > MAX_DOWNLOAD_BYTES)
      return { formato: 'nenhum', texto: null };
    return this.extrairDeBuffer(buffer);
  }

  async extrairDeBuffer(buffer: Buffer): Promise<PlanilhaTexto> {
    const dir = await mkdtemp(join(tmpdir(), 'obrapub-planilha-'));
    try {
      if (ehPdf(buffer)) {
        const p = join(dir, 'doc.pdf');
        await writeFile(p, buffer);
        return { formato: 'pdf', texto: await this.pdfParaTexto(p) };
      }
      if (ehOle2(buffer)) {
        return { formato: 'xls', texto: null }; // .xls binário — fallback manual
      }
      if (ehZip(buffer)) {
        return await this.tratarZip(buffer, dir);
      }
      return { formato: 'nenhum', texto: null };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  private async pdfParaTexto(caminho: string): Promise<string | null> {
    const { stdout } = await execFileP(
      'pdftotext',
      ['-q', '-layout', caminho, '-'],
      {
        maxBuffer: MAX_BUFFER,
      },
    );
    const t = stdout.replace(/\n{3,}/g, '\n\n').trim();
    return t || null;
  }

  // O buffer é um ZIP: ou o próprio .xlsx (xl/workbook.xml), ou um pacote de
  // anexos — neste caso escolhe a melhor planilha interna (pdf/xlsx) pelo nome.
  private async tratarZip(buffer: Buffer, dir: string): Promise<PlanilhaTexto> {
    const zip = join(dir, 'doc.zip');
    const dest = join(dir, 'unzip');
    await writeFile(zip, buffer);
    try {
      await execFileP('unzip', ['-o', '-qq', zip, '-d', dest]);
    } catch (error) {
      this.logger.warn(`ZIP corrompido/ilegível: ${String(error)}`);
      return { formato: 'nenhum', texto: null };
    }

    // O ZIP é o próprio .xlsx?
    if (await this.existe(join(dest, 'xl', 'workbook.xml'))) {
      return { formato: 'xlsx', texto: await this.xlsxParaTexto(dest) };
    }

    // Pacote de anexos: pontua cada arquivo interno e pega a melhor planilha.
    const arquivos = await this.listarRec(dest);
    const cands = arquivos
      .map((p) => ({
        p,
        nome: basename(p),
        score: scorePlanilhaNome(basename(p)),
      }))
      .filter((c) => c.score > 0 && /\.(pdf|xlsx)$/i.test(c.nome))
      .sort(
        (a, b) =>
          b.score - a.score ||
          (/\.xlsx$/i.test(b.nome) ? 1 : 0) - (/\.xlsx$/i.test(a.nome) ? 1 : 0),
      );
    const best = cands[0];
    if (!best) {
      const temXls = arquivos.some((p) => /\.xls$/i.test(p));
      return { formato: temXls ? 'xls' : 'nenhum', texto: null };
    }
    if (/\.xlsx$/i.test(best.nome)) {
      const x = join(dir, 'inner.xlsx');
      await writeFile(x, await readFile(best.p));
      const xdir = join(dir, 'inner-xlsx');
      await execFileP('unzip', ['-o', '-qq', x, '-d', xdir]);
      return { formato: 'xlsx', texto: await this.xlsxParaTexto(xdir) };
    }
    return { formato: 'pdf', texto: await this.pdfParaTexto(best.p) };
  }

  // Lê sharedStrings + todas as worksheets de um .xlsx já descompactado.
  private async xlsxParaTexto(dest: string): Promise<string | null> {
    let shared: string[] = [];
    try {
      shared = parseSharedStrings(
        await readFile(join(dest, 'xl', 'sharedStrings.xml'), 'utf8'),
      );
    } catch {
      /* planilha só com números */
    }
    let nomes: string[];
    try {
      nomes = (await readdir(join(dest, 'xl', 'worksheets')))
        .filter((n) => /\.xml$/i.test(n))
        .sort();
    } catch {
      return null;
    }
    let texto = '';
    for (const n of nomes) {
      const t = sheetParaTexto(
        await readFile(join(dest, 'xl', 'worksheets', n), 'utf8'),
        shared,
      );
      if (t.trim()) texto += `# ${n}\n${t}\n`;
    }
    return texto.trim() || null;
  }

  private async existe(p: string): Promise<boolean> {
    try {
      await stat(p);
      return true;
    } catch {
      return false;
    }
  }

  private async listarRec(dir: string): Promise<string[]> {
    const out: string[] = [];
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) out.push(...(await this.listarRec(p)));
      else out.push(p);
    }
    return out;
  }
}
