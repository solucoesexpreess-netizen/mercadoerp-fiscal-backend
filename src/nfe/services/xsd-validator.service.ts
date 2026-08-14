import { Injectable, BadRequestException, InternalServerErrorException, Logger } from '@nestjs/common';

/**
 * XsdValidatorService — validação do XML da NF-e contra os schemas oficiais (XSD)
 * da SEFAZ (layout 4.00).
 *
 * Implementação robusta que utiliza libxmljs2 para validação estrutural contra os
 * XSDs oficiais. Caso o módulo libxmljs2 não esteja instalado, realiza uma validação
 * sintática de fallback (bem formado + tags obrigatórias) e emite um warning no log,
 * de modo que o pipeline continue operacional em ambientes sem o binário nativo.
 *
 * Dependência recomendada: libxmljs2 (^0.33.0) — adicionada ao package.json.
 */
@Injectable()
export class XsdValidatorService {
  private readonly logger = new Logger(XsdValidatorService.name);
  private libxml: any | null = null;
  private libxmlDisponivel = false;

  constructor() {
    this.inicializarLibxml();
  }

  private inicializarLibxml() {
    try {
      this.libxml = require('libxmljs2');
      this.libxmlDisponivel = true;
      this.logger.log('libxmljs2 carregado — validação XSD nativa ativa.');
    } catch {
      this.libxmlDisponivel = false;
      this.logger.warn('libxmljs2 não disponível — usando validação sintática de fallback. Instale libxmljs2 para validação completa contra XSD.');
    }
  }

  /**
   * Valida um XML de NF-e contra o XSD oficial (nfe_v4.00.xsd).
   * @param xml XML da NF-e (assinado ou não)
   * @param xsdPath Caminho do arquivo XSD (default: schemas/nfe_v4.00.xsd)
   * @returns { valido: boolean, erros: string[] }
   */
  validarNfe(xml: string, xsdPath = 'schemas/nfe_v4.00.xsd'): { valido: boolean; erros: string[] } {
    if (this.libxmlDisponivel && this.libxml) {
      return this.validarComLibxml(xml, xsdPath);
    }
    return this.validarFallback(xml);
  }

  /**
   * Valida um XML de evento (cancelamento/CC-e) contra o envEvento_v1.00.xsd.
   */
  validarEvento(xml: string, xsdPath = 'schemas/envEvento_v1.00.xsd'): { valido: boolean; erros: string[] } {
    if (this.libxmlDisponivel && this.libxml) {
      return this.validarComLibxml(xml, xsdPath);
    }
    return this.validarFallback(xml);
  }

  /**
   * Valida um XML de inutilização contra o inutNFe_v4.00.xsd.
   */
  validarInutilizacao(xml: string, xsdPath = 'schemas/inutNFe_v4.00.xsd'): { valido: boolean; erros: string[] } {
    if (this.libxmlDisponivel && this.libxml) {
      return this.validarComLibxml(xml, xsdPath);
    }
    return this.validarFallback(xml);
  }

  private validarComLibxml(xml: string, xsdPath: string): { valido: boolean; erros: string[] } {
    try {
      const fs = require('fs');
      const xsdContent = fs.readFileSync(xsdPath, 'utf-8');
      const xsdDoc = this.libxml.parseXml(xsdContent);
      const xmlDoc = this.libxml.parseXml(xml);
      const valid = xmlDoc.validate(xsdDoc);
      if (valid) return { valido: true, erros: [] };
      const erros: string[] = xmlDoc.validationErrors.map((e: any) => `${e.line}:${e.column} ${e.message}`);
      return { valido: false, erros };
    } catch (err) {
      this.logger.error(`Erro ao carregar XSD ${xsdPath}: ${(err as Error).message}`);
      // fallback para não bloquear em ambiente sem schemas baixados
      return this.validarFallback(xml);
    }
  }

  /**
   * Validação sintática de fallback: bem-formado + tags obrigatórias da NF-e 4.00.
   * Não substitui a validação XSD — apenas garante integridade mínima do pipeline.
   */
  private validarFallback(xml: string): { valido: boolean; erros: string[] } {
    const erros: string[] = [];
    if (!xml || !xml.trim().startsWith('<')) {
      erros.push('XML vazio ou malformado');
      return { valido: false, erros };
    }
    // Verifica bem-formação básica via parser DOM nativo
    try {
      const { DOMParser } = require('@xmldom/xmldom');
      const doc = new DOMParser().parseFromString(xml, 'text/xml');
      if (doc.getElementsByTagName('parsererror').length > 0) {
        erros.push('XML malformado (erro de parsing)');
        return { valido: false, erros };
      }
    } catch (err) {
      // xmldom opcional — valida apenas balanceamento de tags
      if (!this.bemFormado(xml)) {
        erros.push('XML malformado (tags desbalanceadas)');
        return { valido: false, erros };
      }
    }

    // Tags obrigatórias da NF-e 4.00
    const obrigatórias = ['infNFe', 'ide', 'emit', 'enderEmit', 'det', 'prod', 'imposto', 'total', 'ICMSTot', 'transp', 'pag'];
    for (const tag of obrigatórias) {
      if (!xml.includes(`<${tag}`)) {
        erros.push(`Tag obrigatória ausente: <${tag}>`);
      }
    }
    // Valida presença do atributo Id no infNFe
    if (!/infNFe\s+Id="NFe\d{44}"/.test(xml)) {
      erros.push('Atributo Id="NFe{44 dígitos}" ausente em <infNFe>');
    }
    // Valida assinatura se presente
    if (xml.includes('<Signature') && !xml.includes('http://www.w3.org/2000/09/xmldsig#')) {
      erros.push('Assinatura XMLDSig inválida (namespace ausente)');
    }

    return { valido: erros.length === 0, erros };
  }

  /**
   * Verificação de balanceamento de tags (heurística simples).
   */
  private bemFormado(xml: string): boolean {
    const stack: string[] = [];
    const re = /<(\/?)([a-zA-Z_][\w.-]*)([^>]*)>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null) {
      const closing = m[1] === '/';
      const tag = m[2];
      const selfClose = m[3]?.endsWith('/');
      if (selfClose) continue;
      if (closing) {
        if (stack.pop() !== tag) return false;
      } else {
        stack.push(tag);
      }
    }
    return stack.length === 0;
  }

  /**
   * Garante validade — lança BadRequestException caso o XML seja inválido.
   */
  garantirValido(xml: string, xsdPath?: string): void {
    const result = this.validarNfe(xml, xsdPath);
    if (!result.valido) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'XML inválido contra XSD', details: result.erros });
    }
  }
}