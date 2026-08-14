import { Injectable, Logger } from '@nestjs/common';

/**
 * DanfeService — geração do DANFE (Documento Auxiliar da NF-e) em PDF.
 *
 * Layout simplificado (retrato, 1 página) conforme Manual de Integração do
 * Contribuinte — Anexo V (DANFE Retrato). Foco: representação fiel dos dados
 * essenciais para impressão em mini mercado (cabeçalho, emitente, destinatário,
 * itens, totais, pagamento, chave de acesso e QRCode).
 *
 * Implementação usando pdfkit. Quando a nota é autorizada, adiciona o protocolo
 * e a data de autorização. O QRCode para NFC-e é gerado via payload padrão SEFAZ.
 *
 * Dependência recomendada: pdfkit (^0.15.0) + qrcode (^1.5.3) no package.json.
 */
export interface DanfeDados {
  chave: string;
  numero: string;
  serie: string;
  modelo: '55' | '65';
  dataEmissao: Date;
  naturezaOperacao: string;
  protocolo?: string;
  ambiente: 'homologacao' | 'producao';

  emitente: {
    razaoSocial: string;
    cnpj: string;
    ie: string;
    endereco: string;
    municipio: string;
    uf: string;
    cep: string;
    telefone?: string;
  };
  destinatario: {
    nome: string | null;
    cpfCnpj: string | null;
    endereco: string | null;
    municipio?: string | null;
    uf?: string | null;
  } | null;
  itens: Array<{
    codigo: string;
    nome: string;
    ncm: string;
    cfop: string;
    unidade: string;
    quantidade: number;
    valorUnitario: number;
    valorTotal: number;
  }>;
  total: {
    valorProdutos: number;
    valorTotal: number;
    desconto: number;
    frete: number;
    outras: number;
  };
  pagamento: Array<{ forma: string; valor: number }>;
  informacoesComplementares?: string;
}

const PAGE_W = 595; // A4 pt
const PAGE_H = 842;
const MARGIN = 28;

@Injectable()
export class DanfeService {
  private readonly logger = new Logger(DanfeService.name);

  /**
   * Gera o PDF do DANFE e retorna um Buffer pronto para upload/storage.
   * Em ambiente sem pdfkit instalado, lança erro claro orientando a instalação.
   */
  async gerarPdf(dados: DanfeDados): Promise<Buffer> {
    let PDFDocument: any;
    try {
      ({ PDFDocument } = require('pdfkit'));
    } catch {
      throw new Error('pdfkit não instalado. Adicione "pdfkit" (^0.15.0) ao package.json do backend.');
    }

    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({ size: 'A4', margin: MARGIN, info: { Title: `DANFE ${dados.chave}` } });
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      let y = MARGIN;

      // Cabeçalho: identificação do documento
      y = this.cabecalho(doc, dados, y);
      y = this.blocoEmitente(doc, dados, y + 6);
      y = this.blocoDestinatario(doc, dados, y + 6);
      y = this.blocoItens(doc, dados, y + 6);
      y = this.blocoTotais(doc, dados, y + 6);
      y = this.blocoPagamento(doc, dados, y + 6);
      y = this.blocoRodape(doc, dados, y + 6);

      if (dados.modelo === '65') {
        this.gerarQrCode(doc, dados, y + 6);
      }

      doc.end();
    });
  }

  private cabecalho(doc: any, d: DanfeDados, y: number): number {
    const colW = (PAGE_W - MARGIN * 2) / 3;
    // Quadrado logo (modelo)
    doc.rect(MARGIN, y, 110, 60).stroke();
    doc.fontSize(18).font('Helvetica-Bold').text(d.modelo === '65' ? 'NFC-e' : 'DANFE', MARGIN, y + 10, { width: 110, align: 'center' });
    doc.fontSize(8).font('Helvetica').text('Documento', MARGIN, y + 30, { width: 110, align: 'center' });
    doc.fontSize(8).text('Auxiliar', MARGIN, y + 38, { width: 110, align: 'center' });

    // Bloco central: emitente
    doc.fontSize(11).font('Helvetica-Bold').text(d.emitente.razaoSocial, MARGIN + 116, y + 4, { width: PAGE_W - MARGIN * 2 - 116 - 110 });
    doc.fontSize(7).font('Helvetica').text(
      `CNPJ: ${this.formatCnpj(d.emitente.cnpj)}  IE: ${d.emitente.ie}`,
      MARGIN + 116, y + 22,
      { width: PAGE_W - MARGIN * 2 - 116 - 110 },
    );
    doc.text(d.emitente.endereco, MARGIN + 116, y + 32, { width: PAGE_W - MARGIN * 2 - 116 - 110 });
    doc.text(`${d.emitente.municipio} - ${d.emitente.uf}  CEP: ${this.formatCep(d.emitente.cep)}`, MARGIN + 116, y + 42, { width: PAGE_W - MARGIN * 2 - 116 - 110 });

    // Bloco direito: número/ série/ chave
    const xR = PAGE_W - MARGIN - 110;
    doc.rect(xR, y, 110, 60).stroke();
    doc.fontSize(7).text(`Nº ${d.numero.padStart(9, '0')}`, xR + 2, y + 4, { width: 106, align: 'left' });
    doc.text(`Série ${d.serie}`, xR + 2, y + 12, { width: 106, align: 'left' });
    doc.text(`Folha 1/1`, xR + 2, y + 20, { width: 106, align: 'left' });
    doc.text(d.ambiente === 'homologacao' ? 'HOMOLOGAÇÃO' : 'PRODUÇÃO', xR + 2, y + 30, { width: 106, align: 'left' });
    doc.text(`Emissão: ${this.fmtDate(d.dataEmissao)}`, xR + 2, y + 42, { width: 106, align: 'left' });

    return y + 60;
  }

  private blocoEmitente(doc: any, d: DanfeDados, y: number): number {
    const h = 22;
    doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, h).stroke();
    doc.fontSize(6).text('EMITENTE', MARGIN + 2, y + 2);
    doc.fontSize(9).font('Helvetica-Bold').text(d.emitente.razaoSocial, MARGIN + 2, y + 9, { width: PAGE_W - MARGIN * 2 - 4 });
    doc.fontSize(7).font('Helvetica').text(`${d.emitente.endereco} - ${d.emitente.municipio}/${d.emitente.uf}`, MARGIN + 2, y + 17, { width: PAGE_W - MARGIN * 2 - 4 });
    return y + h;
  }

  private blocoDestinatario(doc: any, d: DanfeDados, y: number): number {
    const h = 28;
    doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, h).stroke();
    doc.fontSize(6).text('DESTINATÁRIO / REMETENTE', MARGIN + 2, y + 2);
    const dest = d.destinatario;
    doc.fontSize(9).font('Helvetica-Bold').text(dest?.nome || 'CONSUMIDOR NÃO IDENTIFICADO', MARGIN + 2, y + 9, { width: PAGE_W - MARGIN * 2 - 4 });
    doc.fontSize(7).font('Helvetica').text(
      dest?.cpfCnpj ? `CPF/CNPJ: ${this.formatCpfCnpj(dest.cpfCnpj)}` : 'CPF/CNPJ: Não informado',
      MARGIN + 2, y + 20, { width: PAGE_W - MARGIN * 2 - 4 },
    );
    return y + h;
  }

  private blocoItens(doc: any, d: DanfeDados, y: number): number {
    const cols = [
      { label: 'CÓDIGO', x: MARGIN, w: 60 },
      { label: 'DESCRIÇÃO', x: MARGIN + 60, w: 250 },
      { label: 'NCM', x: MARGIN + 310, w: 50 },
      { label: 'CFOP', x: MARGIN + 360, w: 35 },
      { label: 'UN', x: MARGIN + 395, w: 25 },
      { label: 'QTD', x: MARGIN + 420, w: 40 },
      { label: 'V.UNIT', x: MARGIN + 460, w: 45 },
      { label: 'V.TOT', x: MARGIN + 505, w: 62 },
    ];
    const headerH = 12;
    doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, headerH).stroke();
    doc.fontSize(6).font('Helvetica-Bold');
    cols.forEach((c) => doc.text(c.label, c.x + 1, y + 3, { width: c.w - 2, align: 'left' }));

    let yi = y + headerH;
    doc.font('Helvetica').fontSize(7);
    d.itens.forEach((item) => {
      const rowH = 14;
      doc.rect(MARGIN, yi, PAGE_W - MARGIN * 2, rowH).stroke();
      doc.text(item.codigo, cols[0].x + 1, yi + 3, { width: cols[0].w - 2 });
      doc.text(item.nome, cols[1].x + 1, yi + 3, { width: cols[1].w - 2 });
      doc.text(item.ncm, cols[2].x + 1, yi + 3, { width: cols[2].w - 2 });
      doc.text(item.cfop, cols[3].x + 1, yi + 3, { width: cols[3].w - 2 });
      doc.text(item.unidade, cols[4].x + 1, yi + 3, { width: cols[4].w - 2 });
      doc.text(this.dec(item.quantidade, 3), cols[5].x + 1, yi + 3, { width: cols[5].w - 2, align: 'right' });
      doc.text(this.dec(item.valorUnitario, 2), cols[6].x + 1, yi + 3, { width: cols[6].w - 2, align: 'right' });
      doc.text(this.dec(item.valorTotal, 2), cols[7].x + 1, yi + 3, { width: cols[7].w - 2, align: 'right' });
      yi += rowH;
    });
    return yi;
  }

  private blocoTotais(doc: any, d: DanfeDados, y: number): number {
    const h = 30;
    doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, h).stroke();
    doc.fontSize(6).text('TOTAIS', MARGIN + 2, y + 2);
    doc.fontSize(8).font('Helvetica');
    doc.text(`Produtos: ${this.dec(d.total.valorProdutos, 2)}`, MARGIN + 2, y + 10, { width: 180 });
    if (d.total.desconto) doc.text(`Desconto: ${this.dec(d.total.desconto, 2)}`, MARGIN + 2, y + 20, { width: 180 });
    doc.font('Helvetica-Bold').text(`VALOR TOTAL: R$ ${this.dec(d.total.valorTotal, 2)}`, PAGE_W - MARGIN - 200, y + 16, { width: 198, align: 'right' });
    return y + h;
  }

  private blocoPagamento(doc: any, d: DanfeDados, y: number): number {
    const h = 16 + d.pagamento.length * 12;
    doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, h).stroke();
    doc.fontSize(6).text('PAGAMENTO', MARGIN + 2, y + 2);
    doc.fontSize(8).font('Helvetica');
    let yp = y + 10;
    d.pagamento.forEach((p) => {
      doc.text(`${p.forma}: ${this.dec(p.valor, 2)}`, MARGIN + 2, yp, { width: 200 });
      yp += 12;
    });
    return y + h;
  }

  private blocoRodape(doc: any, d: DanfeDados, y: number): number {
    const h = 50;
    doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, h).stroke();
    doc.fontSize(6).text('CHAVE DE ACESSO', MARGIN + 2, y + 2);
    doc.fontSize(10).font('Helvetica-Bold').text(this.formatChave(d.chave), MARGIN + 2, y + 10, { width: PAGE_W - MARGIN * 2 - 4 });
    if (d.protocolo) {
      doc.fontSize(7).font('Helvetica').text(`Protocolo de Autorização: ${d.protocolo} - ${this.fmtDateTime(d.dataEmissao)}`, MARGIN + 2, y + 28, { width: PAGE_W - MARGIN * 2 - 4 });
    }
    if (d.ambiente === 'homologacao') {
      doc.text('DOCUMENTO EMITIDO EM AMBIENTE DE HOMOLOGAÇÃO — SEM VALOR FISCAL', MARGIN + 2, y + 40, { width: PAGE_W - MARGIN * 2 - 4, align: 'center' });
    }
    if (d.informacoesComplementares) {
      doc.text(d.informacoesComplementares, MARGIN + 2, y + 46, { width: PAGE_W - MARGIN * 2 - 4 });
    }
    return y + h;
  }

  private gerarQrCode(doc: any, d: DanfeDados, y: number) {
    try {
      const QRCode = require('qrcode');
      const payload = `https://www.homologacao.nfe.fazenda.sp.gov.br/qrcode?p=${d.chave}|2`;
      const dataUrl = QRCode.sync.toDataURL(payload, { margin: 0, width: 120 });
      doc.image(dataUrl, PAGE_W - MARGIN - 120, y, { width: 120, height: 120 });
    } catch (err) {
      this.logger.warn(`QRCode não gerado (qrcode não instalado): ${(err as Error).message}`);
    }
  }

  // ─────────────────────────────────────────────
  // Formatadores
  // ─────────────────────────────────────────────
  private dec(v: number, casas: number): string { return Number(v || 0).toFixed(casas); }
  private fmtDate(d: Date): string { return d.toLocaleDateString('pt-BR'); }
  private fmtDateTime(d: Date): string { return d.toLocaleString('pt-BR'); }
  private formatCnpj(v: string): string { const s = v.replace(/\D/g, '').padStart(14, '0'); return s.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5'); }
  private formatCpfCnpj(v: string): string { const s = v.replace(/\D/g, ''); return s.length > 11 ? this.formatCnpj(s) : s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'); }
  private formatCep(v: string): string { return v.replace(/(\d{5})(\d{3})/, '$1-$2'); }
  private formatChave(v: string): string { return v.replace(/(\d{4})(?=\d)/g, '$1 '); }
}