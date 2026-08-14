import { Injectable, BadRequestException } from '@nestjs/common';
import { create, fragment } from 'xmlbuilder2';
import { ImpostoBuilderService, DadosTributacaoItem, DadosOperacao } from './imposto-builder.service';
import { CODIGO_PAIS_BRASIL, NOME_PAIS_BRASIL, UF_CODES } from './sefaz-urls';

/**
 * XmlBuilderService — montagem do XML da NF-e/NFC-e 4.00 conforme o Manual de
 * Orientação do Contribuinte (MOC), respeitando a ordem e obrigatoriedade dos
 * grupos: ide, emit, dest (NF-e), retirada/entrega (opc), autXML (opc), det,
 * total, transp, cobr (opc), pag, infAdic, export, compra, intermed (opc).
 *
 * Saída: string XML não assinada, canônica, pronta para o AssinaturaService.
 * A tag <infNFe> recebe o atributo Id="NFe{chave44}", referência da assinatura.
 */

export interface EnderecoEmissor {
  logradouro: string;
  numero: string;
  complemento?: string;
  bairro: string;
  codigoMunicipio: string; // IBGE 7 dígitos
  municipio: string;
  uf: string;
  cep: string;
  codigoPais?: string;
  nomePais?: string;
  telefone?: string;
  email?: string;
}

export interface EmitenteDados {
  cnpj: string;
  razaoSocial: string;
  ie: string;
  iest?: string;       // Inscrição Estadual ST
  im?: string;         // Inscrição Municipal
  cnae?: string;
  crt: '1' | '2' | '3';
  endereco: EnderecoEmissor;
}

export interface DestinatarioDados {
  cpfCnpj: string | null; // null = consumidor não identificado (NFC-e)
  nome: string | null;
  ie?: string;
  endereco: EnderecoEmissor | null;
  indIEDest?: '1' | '2' | '9'; // 1=Contrib, 9=Não contrib
  email?: string;
}

export interface ItemDados {
  numero: number;
  produto: {
    codigo: string;
    codigoBarras?: string | null;
    nome: string;
    ncm: string;
    cest?: string | null;
    cfop: string;
    unidade: string;
    valorUnitario: number;
    quantidade: number;
  };
  frete?: number;
  seguro?: number;
  desconto?: number;
  outrasDespesas?: number;
  tributacao: DadosTributacaoItem;
  infoAdicional?: string;
  numeroPedido?: string;
  itemPedido?: number;
  nItemPed?: number;
  nFCI?: string;
  nRECOPI?: string;
}

export interface PagamentoDados {
  forma: 'DINHEIRO' | 'PIX' | 'DEBITO' | 'CREDITO' | 'FIADO' | 'SEM_PAGAMENTO' | 'CREDIARIO';
  valor: number;
  bandeira?: string; // para débito/crédito
  cnpjCredenciadora?: string;
  tPag?: string; // override do tPag SEFAZ
}

export interface TransporteDados {
  modFrete: '0' | '1' | '2' | '3' | '4' | '9'; // 0=Por conta remetente, 9=Sem frete
  transportadora?: {
    cnpjCpf?: string;
    nome?: string;
    ie?: string;
    endereco?: string;
    municipio?: string;
    uf?: string;
  };
  volume?: Array<{
    quantidade?: number;
    especie?: string;
    marca?: string;
    numeracao?: string;
    pesoLiquido?: number;
    pesoBruto?: number;
  }>;
  veiculo?: { placa?: string; uf?: string; rntc?: string };
}

export interface InformacoesAdicionais {
  informacoesComplementares?: string;
  observacoesFisco?: string;
  processosReferenciados?: Array<{ nro?: string; indentificador?: string }>;
  usuario?: { id?: string; nome?: string };
}

export interface XmlBuilderInput {
  chave: string;            // 44 dígitos
  numero: number;
  serie: string;
  modelo: '55' | '65';
  dataEmissao: Date;
  dataSaidaEntrada?: Date;
  naturezaOperacao: string;
  formaEmissao?: string;     // tpEmis (1=Normal)
  finalidade: string;        // finNFe (1=Normal)
  indicadorPresenca: string; // indPres
  indicadorIntermediador?: string; // indIntermed
  ambiente: 'homologacao' | 'producao';
  emitente: EmitenteDados;
  destinatario: DestinatarioDados | null;
  itens: ItemDados[];
  pagamentos: PagamentoDados[];
  transporte: TransporteDados;
  informacoesAdicionais?: InformacoesAdicionais;
  intermed?: { cnpj?: string; idCadInt?: string };
  retirada?: { cnpjCpf?: string; xNome?: string; endereco?: EnderecoEmissor };
  entrega?: { cnpjCpf?: string; xNome?: string; endereco?: EnderecoEmissor };
  exportacao?: { ufSaida?: string; localEmbarque?: string; localDespacho?: string };
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

@Injectable()
export class XmlBuilderService {
  constructor(private readonly impostoBuilder: ImpostoBuilderService) {}

  /**
   * Gera o XML completo da NF-e 4.00, não assinado, em uma única string.
   */
  gerar(input: XmlBuilderInput): string {
    this.validarInput(input);

    const valorTotal = round2(
      input.itens.reduce((s, i) => s + i.produto.valorUnitario * i.produto.quantidade, 0),
    );

    const doc = create({ version: '1.0', encoding: 'UTF-8', standalone: false })
      .ele('NFe', { xmlns: 'http://www.portalfiscal.inf.br/nfe' })
        .ele('infNFe', { Id: `NFe${input.chave}`, versao: '4.00' });

    // ide
    this.gerarIde(doc, input);

    // emit
    this.gerarEmit(doc, input.emitente);

    // dest (obrigatório em NF-e 55; opcional em NFC-e 65)
    this.gerarDest(doc, input);

    // retirada / entrega (opcionais)
    if (input.retirada) this.gerarLocal(doc, 'retirada', input.retirada);
    if (input.entrega) this.gerarLocal(doc, 'entrega', input.entrega);

    // det (itens)
    const totais = this.gerarItens(doc, input, valorTotal);

    // total
    this.gerarTotal(doc, input, valorTotal, totais);

    // transp
    this.gerarTransporte(doc, input.transporte);

    // cobr (opcional) — não implementado por padrão (venda à vista)

    // pag
    this.gerarPagamento(doc, input, valorTotal);

    // infAdic
    this.gerarInformacoesAdicionais(doc, input.informacoesAdicionais);

    // export (opcional)
    if (input.exportacao) this.gerarExportacao(doc, input.exportacao);

    // compra (opcional) — omitido por padrão

    // intermed (opcional) — intermediador marketplace
    if (input.intermed) this.gerarIntermediador(doc, input);

    doc.up(); // fecha infNFe
    doc.up(); // fecha NFe

    return doc.end({ prettyPrint: true, headless: true });
  }

  private validarInput(input: XmlBuilderInput) {
    const erros: string[] = [];
    if (!input.chave || !/^\d{44}$/.test(input.chave)) erros.push('Chave de acesso inválida');
    if (!input.itens?.length) erros.push('Itens obrigatórios');
    if (!input.emitente?.cnpj) erros.push('CNPJ do emitente obrigatório');
    if (!input.emitente?.endereco?.codigoMunicipio) erros.push('Código IBGE do município do emitente obrigatório');
    if (input.modelo === '55' && !input.destinatario) erros.push('Destinatário obrigatório para NF-e (55)');
    if (erros.length) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'XML inválido', details: erros });
  }

  // ─────────────────────────────────────────────
  // ide
  // ─────────────────────────────────────────────
  private gerarIde(doc: any, input: XmlBuilderInput) {
    const decomposicaoChave = input.chave;
    const cUF = decomposicaoChave.slice(0, 2);
    const cNF = decomposicaoChave.slice(35, 43);
    const dv = decomposicaoChave.slice(43, 44);
    const ide = doc.ele('ide');
    ide.ele('cUF').txt(cUF).up();
    ide.ele('cNF').txt(cNF).up();
    ide.ele('natOp').txt(this.t(input.naturezaOperacao || 'VENDA DE MERCADORIA')).up();
    ide.ele('mod').txt(input.modelo).up();
    ide.ele('serie').txt(input.serie).up();
    ide.ele('nNF').txt(String(input.numero).padStart(9, '0')).up();
    ide.ele('dhEmi').txt(input.dataEmissao.toISOString()).up();
    if (input.dataSaidaEntrada) ide.ele('dhSaiEnt').txt(input.dataSaidaEntrada.toISOString()).up();
    ide.ele('tpNF').txt(input.modelo === '65' ? '1' : '1').up(); // saída
    ide.ele('idDest').txt(this.idDest(input)).up();
    ide.ele('cMunFG').txt(input.emitente.endereco.codigoMunicipio).up();
    ide.ele('tpImp').txt(input.modelo === '65' ? '4' : '1').up(); // 1=retrato, 4=NFC-e
    ide.ele('tpEmis').txt(input.formaEmissao ?? '1').up();
    ide.ele('cDV').txt(dv).up();
    ide.ele('tpAmb').txt(input.ambiente === 'producao' ? '1' : '2').up();
    ide.ele('finNFe').txt(input.finalidade ?? '1').up();
    ide.ele('indFinal').txt('1').up(); // consumidor final
    ide.ele('indPres').txt(input.indicadorPresenca ?? '1').up();
    ide.ele('indIntermed').txt(input.indicadorIntermediador ?? '0').up();
    ide.ele('procEmi').txt('0').up();
    ide.ele('verProc').txt('MercadoERP-1.0').up();
    ide.up();
  }

  private idDest(input: XmlBuilderInput): string {
    const ufDest = input.destinatario?.endereco?.uf;
    if (!ufDest) return '1'; // interna
    return ufDest === input.emitente.endereco.uf ? '1' : '2'; // 2=interestadual
  }

  // ─────────────────────────────────────────────
  // emit / enderEmit
  // ─────────────────────────────────────────────
  private gerarEmit(doc: any, e: EmitenteDados) {
    const emit = doc.ele('emit');
    emit.ele('CNPJ').txt(e.cnpj).up();
    emit.ele('xNome').txt(this.t(e.razaoSocial)).up();
    if (e.iest) emit.ele('IE').txt(e.iest).up();
    if (e.im) emit.ele('IM').txt(e.im).up();
    if (e.cnae) emit.ele('CNAE').txt(e.cnae).up();
    const end = emit.ele('enderEmit');
    this.gerarEndereco(end, e.endereco, 'emit');
    emit.ele('CRT').txt(e.crt).up();
    emit.up();
  }

  // ─────────────────────────────────────────────
  // dest / enderDest
  // ─────────────────────────────────────────────
  private gerarDest(doc: any, input: XmlBuilderInput) {
    if (input.modelo === '65' && !input.destinatario) return; // NFC-e: consumidor não identificado
    const d = input.destinatario;
    if (!d) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Destinatário obrigatório para NF-e' });
    }
    const dest = doc.ele('dest');
    if (d.cpfCnpj) {
      const isCnpj = d.cpfCnpj.replace(/\D/g, '').length > 11;
      dest.ele(isCnpj ? 'CNPJ' : 'CPF').txt(d.cpfCnpj.replace(/\D/g, '')).up();
    } else {
      dest.ele('CPF').txt('00000000000').up(); // consumidor não identificado
    }
    if (d.nome) dest.ele('xNome').txt(this.t(d.nome)).up();
    dest.ele('indIEDest').txt(d.indIEDest ?? '9').up();
    if (d.ie && d.cpfCnpj) dest.ele('IE').txt(d.ie).up();
    if (d.email) dest.ele('email').txt(d.email).up();
    if (d.endereco) {
      const end = dest.ele('enderDest');
      this.gerarEndereco(end, d.endereco, 'dest');
    }
    dest.up();
  }

  // ─────────────────────────────────────────────
  // retirada / entrega
  // ─────────────────────────────────────────────
  private gerarLocal(doc: any, tag: 'retirada' | 'entrega', local: { cnpjCpf?: string; xNome?: string; endereco?: EnderecoEmissor }) {
    const node = doc.ele(tag);
    if (local.cnpjCpf) {
      const isCnpj = local.cnpjCpf.replace(/\D/g, '').length > 11;
      node.ele(isCnpj ? 'CNPJ' : 'CPF').txt(local.cnpjCpf.replace(/\D/g, '')).up();
    }
    if (local.xNome) node.ele('xNome').txt(this.t(local.xNome)).up();
    if (local.endereco) this.gerarEndereco(node, local.endereco, tag);
    node.up();
  }

  // ─────────────────────────────────────────────
  // Endereço compartilhado (emit/dest/retirada/entrega)
  // ─────────────────────────────────────────────
  private gerarEndereco(node: any, e: EnderecoEmissor, contexto: 'emit' | 'dest' | 'retirada' | 'entrega') {
    node.ele('xLgr').txt(this.t(e.logradouro)).up();
    node.ele('nro').txt(this.t(e.numero)).up();
    if (e.complemento) node.ele('xCpl').txt(this.t(e.complemento)).up();
    node.ele('xBairro').txt(this.t(e.bairro)).up();
    node.ele('cMun').txt(e.codigoMunicipio).up();
    node.ele('xMun').txt(this.t(e.municipio)).up();
    node.ele('UF').txt(e.uf).up();
    if (e.cep) node.ele('CEP').txt(e.cep).up();
    node.ele('cPais').txt(e.codigoPais ?? CODIGO_PAIS_BRASIL).up();
    node.ele('xPais').txt(this.t(e.nomePais ?? NOME_PAIS_BRASIL)).up();
    if (e.telefone) node.ele('fone').txt(e.telefone).up();
    node.up();
  }

  // ─────────────────────────────────────────────
  // det (itens) + imposto
  // ─────────────────────────────────────────────
  private gerarItens(doc: any, input: XmlBuilderInput, valorTotal: number) {
    let vBC = 0, vICMS = 0, vBCST = 0, vST = 0, vProd = 0, vFrete = 0, vSeg = 0, vDesc = 0, vOutro = 0;
    let vIPI = 0, vPIS = 0, vCOFINS = 0, vFCP = 0, vFCPST = 0, vFCPSTRet = 0, vICMSDeson = 0;
    let vFCPUFDest = 0, vICMSUFDest = 0, vICMSUFRemet = 0;

    input.itens.forEach((item) => {
      const vProdItem = round2(item.produto.valorUnitario * item.produto.quantidade);
      vProd = round2(vProd + vProdItem);
      vFrete = round2(vFrete + (item.frete ?? 0));
      vSeg = round2(vSeg + (item.seguro ?? 0));
      vDesc = round2(vDesc + (item.desconto ?? 0));
      vOutro = round2(vOutro + (item.outrasDespesas ?? 0));

      const operacao: DadosOperacao = {
        crt: input.emitente.crt,
        ufEmitente: input.emitente.endereco.uf,
        ufDestinatario: input.destinatario?.endereco?.uf ?? null,
        valorProduto: vProdItem,
        valorFrete: item.frete ?? 0,
        valorSeguro: item.seguro ?? 0,
        valorDesconto: item.desconto ?? 0,
        valorOutrasDespesas: item.outrasDespesas ?? 0,
        consumidorFinal: true,
      };

      const { xml: xmlImposto, calculo } = this.impostoBuilder.construir(operacao, item.tributacao);

      vBC = round2(vBC + calculo.valorBcIcms);
      vICMS = round2(vICMS + calculo.valorIcms);
      vBCST = round2(vBCST + calculo.valorBcIcmsSt);
      vST = round2(vST + calculo.valorIcmsSt);
      vIPI = round2(vIPI + calculo.valorIpi);
      vPIS = round2(vPIS + calculo.valorPis);
      vCOFINS = round2(vCOFINS + calculo.valorCofins);
      vFCP = round2(vFCP + calculo.valorFcp);
      vFCPST = round2(vFCPST + calculo.valorFcpSt);
      vICMSDeson = round2(vICMSDeson + calculo.valorIcmsDesonerado);
      if (calculo.difal) {
        vFCPUFDest = round2(vFCPUFDest + calculo.difal.valorFcpDestino);
        vICMSUFDest = round2(vICMSUFDest + calculo.difal.valorIcmsDestino);
        vICMSUFRemet = round2(vICMSUFRemet + calculo.difal.valorIcmsOrigem);
      }

      const det = doc.ele('det', { nItem: String(item.numero) });
      // prod
      const prod = det.ele('prod');
      prod.ele('cProd').txt(this.t(item.produto.codigo)).up();
      if (item.produto.codigoBarras) prod.ele('cEAN').txt(item.produto.codigoBarras).up();
      else prod.ele('cEAN').txt('SEM GTIN').up();
      prod.ele('xProd').txt(this.t(item.produto.nome)).up();
      prod.ele('NCM').txt(item.produto.ncm).up();
      if (item.produto.cest) prod.ele('CEST').txt(item.produto.cest).up();
      if (item.nFCI) prod.ele('nFCI').txt(item.nFCI).up();
      prod.ele('CFOP').txt(item.produto.cfop).up();
      prod.ele('uCom').txt(item.produto.unidade).up();
      prod.ele('qCom').txt(this.dec(item.produto.quantidade, 4)).up();
      prod.ele('vUnCom').txt(this.dec(item.produto.valorUnitario, 10)).up();
      prod.ele('vProd').txt(this.dec(vProdItem, 2)).up();
      if (item.produto.codigoBarras) prod.ele('cEANTrib').txt(item.produto.codigoBarras).up();
      else prod.ele('cEANTrib').txt('SEM GTIN').up();
      prod.ele('uTrib').txt(item.produto.unidade).up();
      prod.ele('qTrib').txt(this.dec(item.produto.quantidade, 4)).up();
      prod.ele('vUnTrib').txt(this.dec(item.produto.valorUnitario, 10)).up();
      if (item.frete) prod.ele('vFrete').txt(this.dec(item.frete, 2)).up();
      if (item.seguro) prod.ele('vSeg').txt(this.dec(item.seguro, 2)).up();
      if (item.desconto) prod.ele('vDesc').txt(this.dec(item.desconto, 2)).up();
      if (item.outrasDespesas) prod.ele('vOutro').txt(this.dec(item.outrasDespesas, 2)).up();
      if (item.numeroPedido) prod.ele('nItemPed').txt(String(item.nItemPed ?? item.numero)).up();
      prod.up();

      // imposto — importação do fragmento XML gerado pelo ImpostoBuilderService
      det.import(fragment(xmlImposto));

      // infAdProd
      if (item.infoAdicional) det.ele('infAdProd').txt(this.t(item.infoAdicional)).up();

      det.up();
    });

    return { vBC, vICMS, vBCST, vST, vProd, vFrete, vSeg, vDesc, vOutro, vIPI, vPIS, vCOFINS, vFCP, vFCPST, vFCPSTRet, vICMSDeson, vFCPUFDest, vICMSUFDest, vICMSUFRemet, vNF: valorTotal };
  }

  // ─────────────────────────────────────────────
  // total
  // ─────────────────────────────────────────────
  private gerarTotal(doc: any, input: XmlBuilderInput, valorTotal: number, t: any) {
    const total = doc.ele('total');
    const icmsTot = total.ele('ICMSTot');
    icmsTot.ele('vBC').txt(this.dec(t.vBC, 2)).up();
    icmsTot.ele('vICMS').txt(this.dec(t.vICMS, 2)).up();
    icmsTot.ele('vICMSDeson').txt(this.dec(t.vICMSDeson, 2)).up();
    icmsTot.ele('vFCPUFDest').txt(this.dec(t.vFCPUFDest, 2)).up();
    icmsTot.ele('vICMSUFDest').txt(this.dec(t.vICMSUFDest, 2)).up();
    icmsTot.ele('vICMSUFRemet').txt(this.dec(t.vICMSUFRemet, 2)).up();
    icmsTot.ele('vFCP').txt(this.dec(t.vFCP, 2)).up();
    icmsTot.ele('vBCST').txt(this.dec(t.vBCST, 2)).up();
    icmsTot.ele('vST').txt(this.dec(t.vST, 2)).up();
    icmsTot.ele('vFCPST').txt(this.dec(t.vFCPST, 2)).up();
    icmsTot.ele('vFCPSTRet').txt(this.dec(t.vFCPSTRet, 2)).up();
    icmsTot.ele('vProd').txt(this.dec(t.vProd, 2)).up();
    icmsTot.ele('vFrete').txt(this.dec(t.vFrete, 2)).up();
    icmsTot.ele('vSeg').txt(this.dec(t.vSeg, 2)).up();
    icmsTot.ele('vDesc').txt(this.dec(t.vDesc, 2)).up();
    icmsTot.ele('vII').txt('0.00').up();
    icmsTot.ele('vIPI').txt(this.dec(t.vIPI, 2)).up();
    icmsTot.ele('vIPIDevol').txt('0.00').up();
    icmsTot.ele('vPIS').txt(this.dec(t.vPIS, 2)).up();
    icmsTot.ele('vCOFINS').txt(this.dec(t.vCOFINS, 2)).up();
    icmsTot.ele('vOutro').txt(this.dec(t.vOutro, 2)).up();
    icmsTot.ele('vNF').txt(this.dec(valorTotal, 2)).up();
    icmsTot.ele('vTotTrib').txt(this.dec(t.vICMS + t.vST + t.vIPI + t.vPIS + t.vCOFINS, 2)).up();
    icmsTot.up();
    total.up();
  }

  // ─────────────────────────────────────────────
  // transp
  // ─────────────────────────────────────────────
  private gerarTransporte(doc: any, t: TransporteDados) {
    const transp = doc.ele('transp');
    transp.ele('modFrete').txt(t.modFrete).up();
    if (t.transportadora && t.transportadora.cnpjCpf) {
      const tra = transp.ele('transporta');
      const isCnpj = t.transportadora.cnpjCpf.replace(/\D/g, '').length > 11;
      tra.ele(isCnpj ? 'CNPJ' : 'CPF').txt(t.transportadora.cnpjCpf.replace(/\D/g, '')).up();
      if (t.transportadora.nome) tra.ele('xNome').txt(this.t(t.transportadora.nome)).up();
      if (t.transportadora.ie) tra.ele('IE').txt(t.transportadora.ie).up();
      if (t.transportadora.endereco) tra.ele('xEnder').txt(this.t(t.transportadora.endereco)).up();
      if (t.transportadora.municipio) tra.ele('xMun').txt(this.t(t.transportadora.municipio)).up();
      if (t.transportadora.uf) tra.ele('UF').txt(t.transportadora.uf).up();
      tra.up();
    }
    if (t.veiculo) {
      const ret = transp.ele('retTransp');
      if (t.veiculo.placa) ret.ele('placa').txt(t.veiculo.placa).up();
      if (t.veiculo.uf) ret.ele('UF').txt(t.veiculo.uf).up();
      if (t.veiculo.rntc) ret.ele('RNTC').txt(t.veiculo.rntc).up();
      ret.up();
    }
    if (t.volume) {
      t.volume.forEach((v) => {
        const vol = transp.ele('vol');
        if (v.quantidade) vol.ele('qVol').txt(this.dec(v.quantidade, 0)).up();
        if (v.especie) vol.ele('esp').txt(this.t(v.especie)).up();
        if (v.marca) vol.ele('marca').txt(this.t(v.marca)).up();
        if (v.numeracao) vol.ele('nVol').txt(this.t(v.numeracao)).up();
        if (v.pesoLiquido) vol.ele('pesoL').txt(this.dec(v.pesoLiquido, 3)).up();
        if (v.pesoBruto) vol.ele('pesoB').txt(this.dec(v.pesoBruto, 3)).up();
        vol.up();
      });
    }
    transp.up();
  }

  // ─────────────────────────────────────────────
  // pag
  // ─────────────────────────────────────────────
  private gerarPagamento(doc: any, input: XmlBuilderInput, valorTotal: number) {
    const pag = doc.ele('pag');
    input.pagamentos.forEach((p) => {
      const det = pag.ele('detPag');
      det.ele('tPag').txt(this.tPag(p)).up();
      det.ele('vPag').txt(this.dec(p.valor, 2)).up();
      if (p.bandeira && ['DEBITO', 'CREDITO'].includes(p.forma)) {
        det.ele('card').ele('tpIntegra').txt('2').up().ele('CNPJ').txt(p.cnpjCredenciadora || '').up().ele('tBand').txt(p.bandeira).up().up();
      }
      det.up();
    });
    const vTroco = input.pagamentos.reduce((s, p) => s + p.valor, 0) - valorTotal;
    if (vTroco > 0) pag.ele('vTroco').txt(this.dec(vTroco, 2)).up();
    pag.up();
  }

  private tPag(p: PagamentoDados): string {
    if (p.tPag) return p.tPag;
    const map: Record<string, string> = {
      DINHEIRO: '01',
      PIX: '17',
      CREDITO: '03',
      DEBITO: '04',
      FIADO: '05',
      SEM_PAGAMENTO: '90',
      CREDIARIO: '15',
    };
    return map[p.forma] ?? '99';
  }

  // ─────────────────────────────────────────────
  // infAdic
  // ─────────────────────────────────────────────
  private gerarInformacoesAdicionais(doc: any, info?: InformacoesAdicionais) {
    if (!info) return;
    const temInf = info.informacoesComplementares || info.observacoesFisco || info.processosReferenciados?.length;
    if (!temInf) return;
    const inf = doc.ele('infAdic');
    if (info.informacoesComplementares) inf.ele('infCpl').txt(this.t(info.informacoesComplementares)).up();
    if (info.observacoesFisco) inf.ele('infAdFisco').txt(this.t(info.observacoesFisco)).up();
    if (info.processosReferenciados?.length) {
      info.processosReferenciados.forEach((pr) => {
        const proc = inf.ele('procRef');
        if (pr.nro) proc.ele('nProc').txt(pr.nro).up();
        proc.ele('indProc').txt('0').up();
        proc.up();
      });
    }
    inf.up();
  }

  private gerarExportacao(doc: any, exp: { ufSaida?: string; localEmbarque?: string; localDespacho?: string }) {
    const e = doc.ele('exporta');
    if (exp.ufSaida) e.ele('UFSaidaPais').txt(exp.ufSaida).up();
    if (exp.localEmbarque) e.ele('xLocExporta').txt(this.t(exp.localEmbarque)).up();
    if (exp.localDespacho) e.ele('xLocDespacho').txt(this.t(exp.localDespacho)).up();
    e.up();
  }

  private gerarIntermediador(doc: any, input: XmlBuilderInput) {
    if (!input.intermed) return;
    const i = doc.ele('intermed');
    if (input.intermed.cnpj) i.ele('CNPJ').txt(input.intermed.cnpj).up();
    if (input.intermed.idCadInt) i.ele('idCadIntTran').txt(input.intermed.idCadInt).up();
    i.up();
  }

  // ─────────────────────────────────────────────
  // Utilitários
  // ─────────────────────────────────────────────
  private dec(v: number, casas: number): string {
    return Number(v).toFixed(casas);
  }

  private t(s: string): string {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}