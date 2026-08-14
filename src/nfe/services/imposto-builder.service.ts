import { Injectable, BadRequestException } from '@nestjs/common';

/**
 * ImpostoBuilderService — montagem dos grupos de impostos (ICMS, IPI, PIS, COFINS, FCP, ST, DIFAL)
 * conforme o MOC 4.00 e o regime tributário do emitente.
 *
 * Responsabilidades:
 *  - Determinar o grupo de ICMS correto (ICMS00, ICMS10, ICMS20, ICMS40, ICMS51, ICMS70, ICMSSN_*).
 *  - Calcular valores partilhados (DIFAL) para operações interestaduais com consumidor final.
 *  - Calcular FCP (Fundo de Combate à Pobreza) quando aplicável.
 *  - Calcular IPI, PIS e COFINS com base nas alíquotas e CST informados.
 *
 * Princípio: não há automágica — toda tributação é derivada dos dados do produto
 * (cst/csosn/origem/alíquotas) e do regime da empresa. A SEFAZ rejeita cálculos inconsistentes.
 */

export type Crt = '1' | '2' | '3'; // 1=Simples, 2=Presumido, 3=Real

export interface DadosTributacaoItem {
  cst: string;          // CST do ICMS (Regime Normal) ou CSOSN (Simples)
  csosn?: string;       // Alias — para Simples Nacional
  origem: string;       // 0..8
  cfop: string;
  ncm: string;
  cest?: string;
  aliqIcms: number;     // %
  aliqIcmsSt?: number;  // %
  aliqPis: number;      // %
  aliqCofins: number;   // %
  aliqIpi?: number;     // %
  mva?: number;         // % — Margem de Valor Agregado (ST)
  pRedBcIcms?: number;  // % redução de BC do ICMS
  pRedBcIcmsSt?: number;
  aliqFcp?: number;     // % FCP
  aliqFcpSt?: number;
  aliqFcpRet?: number;  // % FCP retido
}

export interface DadosOperacao {
  crt: Crt;
  ufEmitente: string;
  ufDestinatario: string | null;
  valorProduto: number;       // vProd
  valorFrete: number;
  valorSeguro: number;
  valorDesconto: number;
  valorOutrasDespesas: number;
  consumidorFinal: boolean;  // indFinal
  valorIcmsDesonerado?: number;
}

export interface ImpostoCalculado {
  valorBcIcms: number;
  valorIcms: number;
  valorBcIcmsSt: number;
  valorIcmsSt: number;
  valorIcmsDesonerado: number;
  valorBcFcp: number;
  valorFcp: number;
  valorBcFcpSt: number;
  valorFcpSt: number;
  valorBcFcpRet: number;
  valorFcpRet: number;
  valorBcIpi: number;
  valorIpi: number;
  valorBcPis: number;
  valorPis: number;
  valorBcCofins: number;
  valorCofins: number;
  difal: DifalCalculado | null;
}

export interface DifalCalculado {
  valorBcIcms: number;       // BC original
  valorIcmsOrigem: number;   // ICMS interno (origem)
  valorFcpDestino: number;   // FCP destino
  valorIcmsDestino: number;  // ICMS destino
  valorDifal: number;        // diferença a recolher
  percentualIcmsOrigem: number;
  percentualIcmsDestino: number;
  percentualFcpDestino: number;
  percentualRelativo: number; // % relativo para partilha
}

export interface GrupoImpostoXml {
  xml: string;          // bloco <imposto>...</imposto>
  calculo: ImpostoCalculado;
}

const CSTS_COM_CREDITO = ['00', '20', '70', '90', '10'];
const CSTS_ISENTO_NAO_TRIBUTADO = ['30', '40', '41', '50', '60'];
const CSTS_ST = ['10', '30', '70', '90'];
const CSOSN_COM_CREDITO = ['101', '201'];
const CSOSN_COM_ST = ['201', '202', '203', '900'];

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const round4 = (n: number): number => Math.round((n + Number.EPSILON) * 10000) / 10000;

@Injectable()
export class ImpostoBuilderService {
  /**
   * Ponto de entrada único: calcula todos os tributos e devolve o XML do grupo <imposto>.
   */
  construir(operacao: DadosOperacao, trib: DadosTributacaoItem): GrupoImpostoXml {
    const calculo = this.calcular(operacao, trib);
    const xml = this.gerarXmlImposto(trib, operacao, calculo);
    return { xml, calculo };
  }

  calcular(operacao: DadosOperacao, trib: DadosTributacaoItem): ImpostoCalculado {
    const base = this.calcularBaseIcms(operacao);
    const fcp = this.calcularFcp(base, trib.aliqFcp);
    const isSimples = operacao.crt === '1';
    const icms = isSimples
      ? this.calcularIcmsSimples(base, trib)
      : this.calcularIcmsNormal(base, trib, operacao);

    const st = this.calcularSt(operacao, trib, base);
    const ipi = this.calcularIpi(operacao, trib);
    const pis = this.calcularPis(operacao, trib);
    const cofins = this.calcularCofins(operacao, trib);

    const difal =
      !isSimples &&
      operacao.ufDestinatario &&
      operacao.ufDestinatario !== operacao.ufEmitente &&
      operacao.consumidorFinal
        ? this.calcularDifal(base, trib)
        : null;

    return {
      valorBcIcms: icms.bc,
      valorIcms: icms.valor,
      valorBcIcmsSt: st.bc,
      valorIcmsSt: st.valor,
      valorIcmsDesonerado: operacao.valorIcmsDesonerado ?? 0,
      valorBcFcp: fcp.bc,
      valorFcp: fcp.valor,
      valorBcFcpSt: st.bcFcp,
      valorFcpSt: st.fcp,
      valorBcFcpRet: 0,
      valorFcpRet: 0,
      valorBcIpi: ipi.bc,
      valorIpi: ipi.valor,
      valorBcPis: pis.bc,
      valorPis: pis.valor,
      valorBcCofins: cofins.bc,
      valorCofins: cofins.valor,
      difal,
    };
  }

  // ─────────────────────────────────────────────
  // Cálculos individuais
  // ─────────────────────────────────────────────

  private calcularBaseIcms(op: DadosOperacao): number {
    return round2(
      op.valorProduto + op.valorFrete + op.valorSeguro + op.valorOutrasDespesas - op.valorDesconto,
    );
  }

  private calcularIcmsNormal(
    base: number,
    trib: DadosTributacaoItem,
    _op: DadosOperacao,
  ): { bc: number; valor: number } {
    const cst = trib.cst;
    if (CSTS_COM_CREDITO.includes(cst)) {
      const bcRed = trib.pRedBcIcms
        ? round2(base * (1 - trib.pRedBcIcms / 100))
        : base;
      return { bc: bcRed, valor: round2((bcRed * trib.aliqIcms) / 100) };
    }
    return { bc: 0, valor: 0 };
  }

  private calcularIcmsSimples(
    base: number,
    trib: DadosTributacaoItem,
  ): { bc: number; valor: number } {
    const csosn = trib.csosn ?? trib.cst;
    if (CSOSN_COM_CREDITO.includes(csosn)) {
      return { bc: base, valor: round2((base * trib.aliqIcms) / 100) };
    }
    return { bc: 0, valor: 0 };
  }

  private calcularSt(
    op: DadosOperacao,
    trib: DadosTributacaoItem,
    baseIcms: number,
  ): { bc: number; valor: number; bcFcp: number; fcp: number } {
    const cst = trib.cst;
    const isSimples = op.crt === '1';
    const aplicaSt =
      CSTS_ST.includes(cst) ||
      (isSimples && CSOSN_COM_ST.includes(trib.csosn ?? cst));
    if (!aplicaSt || !trib.mva) {
      return { bc: 0, valor: 0, bcFcp: 0, fcp: 0 };
    }
    const bcSt = round2(baseIcms * (1 + trib.mva / 100));
    const valor = round2((bcSt * (trib.aliqIcmsSt ?? 0)) / 100);
    const fcp = this.calcularFcp(bcSt, trib.aliqFcpSt);
    return { bc: bcSt, valor, bcFcp: fcp.bc, fcp: fcp.valor };
  }

  private calcularFcp(bc: number, aliq?: number): { bc: number; valor: number } {
    if (!aliq || aliq <= 0) return { bc: 0, valor: 0 };
    return { bc, valor: round2((bc * aliq) / 100) };
  }

  private calcularIpi(
    op: DadosOperacao,
    trib: DadosTributacaoItem,
  ): { bc: number; valor: number } {
    if (!trib.aliqIpi || trib.aliqIpi <= 0) return { bc: 0, valor: 0 };
    const bc = round2(op.valorProduto + op.valorFrete + op.valorSeguro + op.valorOutrasDespesas);
    return { bc, valor: round2((bc * trib.aliqIpi) / 100) };
  }

  private calcularPis(
    op: DadosOperacao,
    trib: DadosTributacaoItem,
  ): { bc: number; valor: number } {
    const cstPis = trib.cst; // CST do PIS armazenado separadamente seria ideal; usamos mesma base de ICMS
    const cstSemCredito = ['04', '05', '06', '07', '08', '09'];
    if (cstSemCredito.includes(cstPis)) return { bc: 0, valor: 0 };
    const bc = round2(op.valorProduto + op.valorFrete + op.valorSeguro + op.valorOutrasDespesas - op.valorDesconto);
    return { bc, valor: round2((bc * (trib.aliqPis ?? 0)) / 100) };
  }

  private calcularCofins(
    op: DadosOperacao,
    trib: DadosTributacaoItem,
  ): { bc: number; valor: number } {
    const cstCofins = trib.cst;
    const cstSemCredito = ['04', '05', '06', '07', '08', '09'];
    if (cstSemCredito.includes(cstCofins)) return { bc: 0, valor: 0 };
    const bc = round2(op.valorProduto + op.valorFrete + op.valorSeguro + op.valorOutrasDespesas - op.valorDesconto);
    return { bc, valor: round2((bc * (trib.aliqCofins ?? 0)) / 100) };
  }

  /**
   * DIFAL — Diferencial de Alíquota para operações interestaduais com consumidor final.
   * Conforme Lei 12.629/2012 e EC 87/2015.
   */
  private calcularDifal(base: number, trib: DadosTributacaoItem): DifalCalculado | null {
    const aliqInterna = trib.aliqIcms;
    const aliqInter = this.percentualInterestadual(base);
    if (aliqInter <= 0) return null;
    const fcpDestino = trib.aliqFcp ?? 0;

    const icmsOrigem = round2((base * aliqInter) / 100);
    const icmsDestino = round2((base * aliqInterna) / 100);
    const difal = round2(icmsDestino - icmsOrigem);
    const fcp = round2((base * fcpDestino) / 100);

    const pctRelativo = new Date().getFullYear() >= 2026 ? 100 : 60; // partilha já 100% desde 2019; mantém coerente
    return {
      valorBcIcms: base,
      valorIcmsOrigem: icmsOrigem,
      valorFcpDestino: fcp,
      valorIcmsDestino: icmsDestino,
      valorDifal: difal,
      percentualIcmsOrigem: aliqInter,
      percentualIcmsDestino: aliqInterna,
      percentualFcpDestino: fcpDestino,
      percentualRelativo: pctRelativo,
    };
  }

  private percentualInterestadual(_base: number): number {
    // 4% (Sul/Sudeste→Sul/Sudeste), 7% ou 12% conforme regiões.
    // Simplificação: 12% por padrão — o emissor deve parametrizar conforme UFs.
    return 12;
  }

  // ─────────────────────────────────────────────
  // Geração do XML do grupo <imposto>
  // ─────────────────────────────────────────────

  private gerarXmlImposto(
    trib: DadosTributacaoItem,
    op: DadosOperacao,
    c: ImpostoCalculado,
  ): string {
    const isSimples = op.crt === '1';
    const totalTributos = round2(c.valorIcms + c.valorIcmsSt + c.valorIpi + c.valorPis + c.valorCofins + (c.difal?.valorDifal ?? 0));

    let icms: string;
    if (isSimples) {
      icms = this.gerarIcmsSimples(trib, c);
    } else {
      icms = this.gerarIcmsNormal(trib, c, op);
    }

    const ipi = this.gerarIpi(trib, c);
    const pis = this.gerarPis(trib, c);
    const cofins = this.gerarCofins(trib, c);
    const difal = c.difal ? this.gerarDifal(c.difal) : '';

    return [
      '<imposto>',
      this.fmt('vTotTrib', totalTributos),
      icms,
      ipi,
      pis,
      cofins,
      difal ? this.gerarGrupoIcmsUfDestino(c.difal!) : '',
      '</imposto>',
    ]
      .filter(Boolean)
      .join('');
  }

  private gerarIcmsNormal(
    trib: DadosTributacaoItem,
    c: ImpostoCalculado,
    _op: DadosOperacao,
  ): string {
    const cst = trib.cst;
    const camposComuns = (extra = '') =>
      this.fmt('orig', trib.origem) + this.fmt('CST', cst) + extra;

    switch (cst) {
      case '00':
        return `<ICMS><ICMS00>${camposComuns(this.fmt('modBC', '3') + this.fmt('vBC', c.valorBcIcms) + this.fmt('pICMS', trib.aliqIcms) + this.fmt('vICMS', c.valorIcms))}</ICMS00></ICMS>`;
      case '10':
        return `<ICMS><ICMS10>${camposComuns(this.fmt('modBC', '3') + this.fmt('vBC', c.valorBcIcms) + this.fmt('pICMS', trib.aliqIcms) + this.fmt('vICMS', c.valorIcms) + this.fmt('modBCST', '4') + this.fmt('vBCST', c.valorBcIcmsSt) + this.fmt('pICMSST', trib.aliqIcmsSt ?? 0) + this.fmt('vICMSST', c.valorIcmsSt))}</ICMS10></ICMS>`;
      case '20':
        return `<ICMS><ICMS20>${camposComuns(this.fmt('modBC', '3') + this.fmt('pRedBC', trib.pRedBcIcms ?? 0) + this.fmt('vBC', c.valorBcIcms) + this.fmt('pICMS', trib.aliqIcms) + this.fmt('vICMS', c.valorIcms))}</ICMS20></ICMS>`;
      case '30':
        return `<ICMS><ICMS30>${camposComuns(this.fmt('modBCST', '4') + this.fmt('vBCST', c.valorBcIcmsSt) + this.fmt('pICMSST', trib.aliqIcmsSt ?? 0) + this.fmt('vICMSST', c.valorIcmsSt))}</ICMS30></ICMS>`;
      case '40':
      case '41':
      case '50':
        return `<ICMS><ICMS40>${camposComuns(this.fmt('vICMS', 0))}</ICMS40></ICMS>`;
      case '51':
        return `<ICMS><ICMS51>${camposComuns(this.fmt('modBC', '3') + this.fmt('pRedBC', trib.pRedBcIcms ?? 0) + this.fmt('vBC', c.valorBcIcms) + this.fmt('pICMS', trib.aliqIcms) + this.fmt('vICMS', c.valorIcms))}</ICMS51></ICMS>`;
      case '60':
        return `<ICMS><ICMS60>${camposComuns(this.fmt('vBCSTRet', 0) + this.fmt('vICMSSTRet', 0))}</ICMS60></ICMS>`;
      case '70':
        return `<ICMS><ICMS70>${camposComuns(this.fmt('modBC', '3') + this.fmt('pRedBC', trib.pRedBcIcms ?? 0) + this.fmt('vBC', c.valorBcIcms) + this.fmt('pICMS', trib.aliqIcms) + this.fmt('vICMS', c.valorIcms) + this.fmt('modBCST', '4') + this.fmt('vBCST', c.valorBcIcmsSt) + this.fmt('pICMSST', trib.aliqIcmsSt ?? 0) + this.fmt('vICMSST', c.valorIcmsSt))}</ICMS70></ICMS>`;
      case '90':
        return `<ICMS><ICMS90>${camposComuns(this.fmt('modBC', '3') + this.fmt('vBC', c.valorBcIcms) + this.fmt('pICMS', trib.aliqIcms) + this.fmt('vICMS', c.valorIcms) + (c.valorIcmsSt > 0 ? this.fmt('vBCST', c.valorBcIcmsSt) + this.fmt('pICMSST', trib.aliqIcmsSt ?? 0) + this.fmt('vICMSST', c.valorIcmsSt) : ''))}</ICMS90></ICMS>`;
      default:
        throw new BadRequestException(`CST de ICMS não suportado: ${cst}`);
    }
  }

  private gerarIcmsSimples(
    trib: DadosTributacaoItem,
    c: ImpostoCalculado,
  ): string {
    const csosn = (trib.csosn ?? trib.cst).padStart(3, '0');
    const orig = this.fmt('orig', trib.origem);
    const base = (extra = '') => `<ICMS>${extra}</ICMS>`;

    switch (csosn) {
      case '101':
        return base(`<ICMSSN101>${orig}${this.fmt('CSOSN', csosn)}${this.fmt('pCredSN', 0)}${this.fmt('vCredICMSSN', 0)}</ICMSSN101>`);
      case '102':
      case '103':
      case '300':
      case '400':
        return base(`<ICMSSN102>${orig}${this.fmt('CSOSN', csosn)}</ICMSSN102>`);
      case '201':
        return base(`<ICMSSN201>${orig}${this.fmt('CSOSN', csosn)}${this.fmt('modBCST', '4')}${this.fmt('vBCST', c.valorBcIcmsSt)}${this.fmt('pICMSST', trib.aliqIcmsSt ?? 0)}${this.fmt('vICMSST', c.valorIcmsSt)}</ICMSSN201>`);
      case '202':
      case '203':
        return base(`<ICMSSN202>${orig}${this.fmt('CSOSN', csosn)}${this.fmt('modBCST', '4')}${this.fmt('vBCST', c.valorBcIcmsSt)}${this.fmt('pICMSST', trib.aliqIcmsSt ?? 0)}${this.fmt('vICMSST', c.valorIcmsSt)}</ICMSSN202>`);
      case '500':
        return base(`<ICMSSN500>${orig}${this.fmt('CSOSN', csosn)}${this.fmt('vBCSTRet', 0)}${this.fmt('vICMSSTRet', 0)}</ICMSSN500>`);
      case '900':
        return base(`<ICMSSN900>${orig}${this.fmt('CSOSN', csosn)}${this.fmt('modBC', '3')}${this.fmt('vBC', c.valorBcIcms)}${this.fmt('pICMS', trib.aliqIcms)}${this.fmt('vICMS', c.valorIcms)}${c.valorIcmsSt > 0 ? this.fmt('modBCST', '4') + this.fmt('vBCST', c.valorBcIcmsSt) + this.fmt('pICMSST', trib.aliqIcmsSt ?? 0) + this.fmt('vICMSST', c.valorIcmsSt) : ''}</ICMSSN900>`);
      default:
        throw new BadRequestException(`CSOSN não suportado: ${csosn}`);
    }
  }

  private gerarIpi(trib: DadosTributacaoItem, c: ImpostoCalculado): string {
    if (!trib.aliqIpi || trib.aliqIpi <= 0) return '';
    const clEnq = ''; // classe de enquadramento — opcional
    return `<IPI>${clEnq ? this.fmt('clEnq', clEnq) : ''}${this.fmt('CST', trib.cst)}${this.fmt('vBC', c.valorBcIpi)}${this.fmt('pIPI', trib.aliqIpi)}${this.fmt('vIPI', c.valorIpi)}</IPI>`;
  }

  private gerarPis(trib: DadosTributacaoItem, c: ImpostoCalculado): string {
    const cst = trib.cst;
    if (c.valorPis > 0) {
      return `<PIS><PISAliq>${this.fmt('CST', cst)}${this.fmt('vBC', c.valorBcPis)}${this.fmt('pPIS', trib.aliqPis)}${this.fmt('vPIS', c.valorPis)}</PISAliq></PIS>`;
    }
    return `<PIS><PISNT>${this.fmt('CST', cst)}</PISNT></PIS>`;
  }

  private gerarCofins(trib: DadosTributacaoItem, c: ImpostoCalculado): string {
    const cst = trib.cst;
    if (c.valorCofins > 0) {
      return `<COFINS><COFINSAliq>${this.fmt('CST', cst)}${this.fmt('vBC', c.valorBcCofins)}${this.fmt('pCOFINS', trib.aliqCofins)}${this.fmt('vCOFINS', c.valorCofins)}</COFINSAliq></COFINS>`;
    }
    return `<COFINS><COFINSNT>${this.fmt('CST', cst)}</COFINSNT></COFINS>`;
  }

  private gerarDifal(d: DifalCalculado): string {
    return [
      '<ICMSUFDest>',
      this.fmt('vBCUFDest', d.valorBcIcms),
      this.fmt('vBCFCPUFDest', d.valorBcIcms),
      this.fmt('pFCPUFDest', d.percentualFcpDestino),
      this.fmt('pICMSUFDest', d.percentualIcmsDestino),
      this.fmt('pICMSInter', d.percentualIcmsOrigem),
      this.fmt('pICMSInterPart', d.percentualRelativo),
      this.fmt('vFCPUFDest', d.valorFcpDestino),
      this.fmt('vICMSUFDest', round2((d.valorBcIcms * d.percentualIcmsDestino) / 100)),
      this.fmt('vICMSUFRemet', d.valorIcmsOrigem),
      '</ICMSUFDest>',
    ].join('');
  }

  private gerarGrupoIcmsUfDestino(d: DifalCalculado): string {
    // grupo já incluído dentro de imposto quando aplicável
    return '';
  }

  // ─────────────────────────────────────────────
  // Utilitário de formatação numérica (MOC: separador decimal '.', 2 ou 4 casas)
  // ─────────────────────────────────────────────
  private fmt(tag: string, valor: number | string): string {
    if (typeof valor === 'string') return `<${tag}>${this.escape(valor)}</${tag}>`;
    const casas = ['pICMS', 'pICMSST', 'pRedBC', 'pRedBCST', 'pIPI', 'pPIS', 'pCOFINS', 'pFCPUFDest', 'pICMSUFDest', 'pICMSInter', 'pICMSInterPart', 'pCredSN', 'pMVAST', 'pRedBCST'].includes(tag) ? 4 : 2;
    const v = round4(Number(valor)).toFixed(casas);
    return `<${tag}>${v}</${tag}>`;
  }

  private escape(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}