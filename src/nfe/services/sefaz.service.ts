import { Injectable, BadRequestException, InternalServerErrorException, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import * as https from 'https';
import { CertificadoService } from '../../certificado/certificado.service';
import { resolverEndpoint, soapAction, SefazEndpoint } from './sefaz-urls';

/**
 * SefazService — comunicação SOAP com os WebServices da SEFAZ (NF-e 4.00).
 *
 * Responsabilidades:
 *  - nfeAutorizacao: envio do lote de NF-e assinado (síncrono no SP 4.00).
 *  - nfeRetAutorizacao: consulta do recibo de processamento.
 *  - nfeConsultaProtocolo: consulta de status por chave de acesso.
 *  - nfeStatusServico: verificação de disponibilidade do webservice.
 *  - nfeInutilizacao: inutilização de faixa de numeração.
 *  - recepcaoEvento: cancelamento, CC-e e demais eventos.
 *
 * Padrão SOAP: documento/literal (document/literal wrapped). O corpo SOAP contém
 * o XML do lote envelopado nas tags do serviço. O certificado A1 é usado tanto
 * para assinatura XMLDSig quanto para o handshake TLS mútuo (mTLS) exigido pela SEFAZ.
 */
export interface RetornoSefaz {
  cStat: string;       // código de status SEFAZ (100=autorizada, 101=cancelada, etc.)
  xMotivo: string;     // descrição do status
  protocolo?: string;  // número do protocolo (15 dígitos) quando autorizada
  recibo?: string;     // número do recibo do lote
  xmlRetorno?: string; // XML completo de retorno (procNFe, retEvento, etc.)
  cuf: string;         // código da UF que processou
  dhRecbto?: string;   // data/hora de processamento
  chNFe?: string;      // chave processada
}

@Injectable()
export class SefazService {
  private readonly logger = new Logger(SefazService.name);

  constructor(private readonly certificado: CertificadoService) {}

  /**
   * Autoriza um lote de NF-e (uma nota por lote — simplificação para mini mercado).
   * No SP 4.00 o processamento é síncrono: a resposta já traz o protocolo.
   */
  async autorizar(
    empresaId: string,
    xmlAssinado: string,
    uf: string,
    modelo: '55' | '65',
    ambiente: 'homologacao' | 'producao',
  ): Promise<RetornoSefaz> {
    const endpoint = resolverEndpoint(uf, ambiente);
    const lote = String(Date.now());
    const corpo = this.envelopeAutorizacao(xmlAssinado, lote, ambiente);
    const resposta = await this.postSoap(empresaId, endpoint.nfeAutorizacao, 'nfeAutorizacaoLote', corpo);
    return this.parseRetornoAutorizacao(resposta);
  }

  /**
   * Consulta o recibo de processamento assíncrono (uso em UFs/processamentos assíncronos).
   */
  async consultarRecibo(
    empresaId: string,
    recibo: string,
    uf: string,
    modelo: '55' | '65',
    ambiente: 'homologacao' | 'producao',
  ): Promise<RetornoSefaz> {
    const endpoint = resolverEndpoint(uf, ambiente);
    const corpo = this.envelopeRetAutorizacao(recibo, ambiente);
    const resposta = await this.postSoap(empresaId, endpoint.nfeRetAutorizacao, 'nfeRetAutorizacaoLote', corpo);
    return this.parseRetornoAutorizacao(resposta);
  }

  /**
   * Consulta o protocolo de uma NF-e por chave de acesso.
   */
  async consultarProtocolo(
    empresaId: string,
    chave: string,
    uf: string,
    ambiente: 'homologacao' | 'producao',
  ): Promise<RetornoSefaz> {
    const endpoint = resolverEndpoint(uf, ambiente);
    const corpo = this.envelopeConsultaProtocolo(chave, ambiente);
    const resposta = await this.postSoap(empresaId, endpoint.nfeConsultaProtocolo, 'nfeConsultaNF', corpo);
    return this.parseRetornoConsulta(resposta);
  }

  /**
   * Consulta o status do serviço da SEFAZ.
   */
  async statusServico(
    empresaId: string,
    uf: string,
    modelo: '55' | '65',
    ambiente: 'homologacao' | 'producao',
  ): Promise<RetornoSefaz> {
    const endpoint = resolverEndpoint(uf, ambiente);
    const corpo = this.envelopeStatusServico(uf, ambiente);
    const resposta = await this.postSoap(empresaId, endpoint.nfeStatusServico, 'nfeStatusServicoNF', corpo);
    return this.parseRetornoStatus(resposta);
  }

  /**
   * Inutilização de faixa de numeração.
   */
  async inutilizar(
    empresaId: string,
    xmlInutilizacaoAssinado: string,
    uf: string,
    ambiente: 'homologacao' | 'producao',
  ): Promise<RetornoSefaz> {
    const endpoint = resolverEndpoint(uf, ambiente);
    const corpo = this.envelopeInutilizacao(xmlInutilizacaoAssinado, ambiente);
    const resposta = await this.postSoap(empresaId, endpoint.nfeInutilizacao, 'nfeInutilizacaoNF', corpo);
    return this.parseRetornoInutilizacao(resposta);
  }

  /**
   * Recepção de evento (cancelamento 110111, CC-e 110110, manifestações).
   */
  async receberEvento(
    empresaId: string,
    xmlEventoAssinado: string,
    uf: string,
    ambiente: 'homologacao' | 'producao',
  ): Promise<RetornoSefaz> {
    const endpoint = resolverEndpoint(uf, ambiente);
    const corpo = this.envelopeEvento(xmlEventoAssinado, ambiente);
    const resposta = await this.postSoap(empresaId, endpoint.recepcaoEvento, 'nfeRecepcaoEvento', corpo);
    return this.parseRetornoEvento(resposta);
  }

  // ─────────────────────────────────────────────
  // Envelopes SOAP (document/literal)
  // ─────────────────────────────────────────────

  private envelopeAutorizacao(xmlNfe: string, lote: string, ambiente: 'homologacao' | 'producao'): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao">
      <enviNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
        <idLote>${lote}</idLote>
        <indSinc>1</indSinc>
        ${xmlNfe}
      </enviNFe>
    </nfeDadosMsg>
  </soap12:Body>
</soap12:Envelope>`;
  }

  private envelopeRetAutorizacao(recibo: string, ambiente: 'homologacao' | 'producao'): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRetAutorizacao">
      <consReciNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
        <tpAmb>${ambiente === 'producao' ? '1' : '2'}</tpAmb>
        <nRec>${recibo}</nRec>
      </consReciNFe>
    </nfeDadosMsg>
  </soap12:Body>
</soap12:Envelope>`;
  }

  private envelopeConsultaProtocolo(chave: string, ambiente: 'homologacao' | 'producao'): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeConsultaProtocolo">
      <consSitNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
        <tpAmb>${ambiente === 'producao' ? '1' : '2'}</tpAmb>
        <xServ>CONSULTAR</xServ>
        <chNFe>${chave}</chNFe>
      </consSitNFe>
    </nfeDadosMsg>
  </soap12:Body>
</soap12:Envelope>`;
  }

  private envelopeStatusServico(uf: string, ambiente: 'homologacao' | 'producao'): string {
    const { UF_CODES } = require('./sefaz-urls');
    const cuf = UF_CODES[uf.toUpperCase()] ?? '35';
    return `<?xml version="1.0" encoding="UTF-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeStatusServico">
      <consStatServ xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
        <tpAmb>${ambiente === 'producao' ? '1' : '2'}</tpAmb>
        <cUF>${cuf}</cUF>
        <xServ>STATUS</xServ>
      </consStatServ>
    </nfeDadosMsg>
  </soap12:Body>
</soap12:Envelope>`;
  }

  private envelopeInutilizacao(xmlInut: string, ambiente: 'homologacao' | 'producao'): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeInutilizacao">
      ${xmlInut}
    </nfeDadosMsg>
  </soap12:Body>
</soap12:Envelope>`;
  }

  private envelopeEvento(xmlEvento: string, ambiente: 'homologacao' | 'producao'): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/RecepcaoEvento">
      ${xmlEvento}
    </nfeDadosMsg>
  </soap12:Body>
</soap12:Envelope>`;
  }

  // ─────────────────────────────────────────────
  // Cliente HTTP com mTLS (certificado A1)
  // ─────────────────────────────────────────────

  private async postSoap(empresaId: string, url: string, operacao: string, corpo: string): Promise<string> {
    const { pfxBuffer, senha } = await this.certificado.carregarParaAssinatura(empresaId);
    const forge = require('node-forge');
    const asn1 = forge.asn1.fromDer(pfxBuffer.toString('binary'));
    const pfx = forge.pkcs12.pkcs12FromAsn1(asn1, senha);

    const keyBag = pfx.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
    const certBag = pfx.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]?.[0];
    if (!keyBag?.key || !certBag?.cert) {
      throw new InternalServerErrorException({ code: 'CERTIFICADO_AUSENTE', message: 'Certificado inválido para mTLS' });
    }

    const keyPem = forge.pki.privateKeyToPem(keyBag.key);
    const certPem = forge.pki.certificateToPem(certBag.cert);

    const agent = new https.Agent({
      pfx: pfxBuffer,
      passphrase: senha,
      key: keyPem,
      cert: certPem,
      rejectUnauthorized: true,
      keepAlive: false,
    });

    try {
      const response = await axios.post(url, corpo, {
        httpAgent: agent,
        httpsAgent: agent,
        headers: {
          'Content-Type': 'application/soap+xml; charset=utf-8',
          'SOAPAction': soapAction(operacao),
        },
        timeout: 60000,
        maxRedirects: 0,
        proxy: false,
      });
      return response.data as string;
    } catch (err: any) {
      const status = err?.response?.status;
      const data = err?.response?.data;
      this.logger.error(`Falha SOAP em ${operacao} (${url}) status=${status}: ${err.message}`);
      if (data) {
        const parsed = this.extrairTags(data);
        if (parsed.cStat) {
          return data; // SEFAZ pode retornar erro de negócio dentro do envelope
        }
      }
      throw new InternalServerErrorException({
        code: 'SEFAZ_REJEITADA',
        message: `Falha na comunicação SOAP com a SEFAZ (${operacao})`,
        details: { status, message: err.message },
      });
    }
  }

  // ─────────────────────────────────────────────
  // Parsing das respostas SEFAZ
  // ─────────────────────────────────────────────

  private parseRetornoAutorizacao(soapXml: string): RetornoSefaz {
    const t = this.extrairTags(soapXml);
    return {
      cStat: t.cStat ?? '',
      xMotivo: t.xMotivo ?? '',
      protocolo: t.nProt,
      recibo: t.nRec,
      chNFe: t.chNFe,
      dhRecbto: t.dhRecbto,
      cuf: t.cUF ?? '',
      xmlRetorno: t.protNFe || soapXml,
    };
  }

  private parseRetornoConsulta(soapXml: string): RetornoSefaz {
    const t = this.extrairTags(soapXml);
    return {
      cStat: t.cStat ?? '',
      xMotivo: t.xMotivo ?? '',
      protocolo: t.nProt,
      chNFe: t.chNFe,
      dhRecbto: t.dhRecbto,
      cuf: t.cUF ?? '',
      xmlRetorno: t.protNFe || soapXml,
    };
  }

  private parseRetornoStatus(soapXml: string): RetornoSefaz {
    const t = this.extrairTags(soapXml);
    return {
      cStat: t.cStat ?? '',
      xMotivo: t.xMotivo ?? '',
      dhRecbto: t.dhRecbto,
      cuf: t.cUF ?? '',
      xmlRetorno: soapXml,
    };
  }

  private parseRetornoInutilizacao(soapXml: string): RetornoSefaz {
    const t = this.extrairTags(soapXml);
    return {
      cStat: t.cStat ?? '',
      xMotivo: t.xMotivo ?? '',
      protocolo: t.nProt,
      dhRecbto: t.dhRecbto,
      cuf: t.cUF ?? '',
      xmlRetorno: soapXml,
    };
  }

  private parseRetornoEvento(soapXml: string): RetornoSefaz {
    const t = this.extrairTags(soapXml);
    return {
      cStat: t.cStat ?? '',
      xMotivo: t.xMotivo ?? '',
      protocolo: t.nProt,
      chNFe: t.chNFe,
      dhRecbto: t.dhRecbto,
      cuf: t.cUF ?? '',
      xmlRetorno: soapXml,
    };
  }

  /**
   * Extrator simples de tags relevantes da resposta SOAP (sem dependência de parser).
   * Captura apenas a primeira ocorrência de cada tag — suficiente para os retornos padrão.
   */
  private extrairTags(xml: string): Record<string, string> {
    const tags = ['cStat', 'xMotivo', 'nProt', 'nRec', 'chNFe', 'dhRecbto', 'cUF', 'cMsg', 'xMsg', 'protNFe'];
    const out: Record<string, string> = {};
    for (const tag of tags) {
      const re = new RegExp(`<(?:[a-zA-Z]+:)?${tag}[^>]*>([^<]*)</(?:[a-zA-Z]+:)?${tag}>`, 'i');
      const m = xml.match(re);
      if (m) out[tag] = m[1].trim();
    }
    // protNFe completo (conteúdo entre as tags)
    const protMatch = xml.match(/<(?:[a-zA-Z]+:)?protNFe[^>]*>([\s\S]*?)<\/(?:[a-zA-Z]+:)?protNFe>/i);
    if (protMatch) out.protNFe = protMatch[0];
    return out;
  }
}