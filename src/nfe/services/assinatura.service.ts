import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import * as xmlCrypto from 'xml-crypto';
import { CertificadoService } from '../../certificado/certificado.service';

/**
 * AssinaturaService — assinatura digital XMLDSig compatível com a SEFAZ.
 *
 * Responsabilidades:
 *  - Assinar o elemento <infNFe> de uma NF-e (reference por atributo Id).
 *  - Assinar o elemento <infEvento> de um evento (cancelamento, CC-e).
 *  - Assinar o elemento <infInut> de uma inutilização.
 *  - Usar SHA-1 + RSA-SHA1 + Canonicalização C14N (padrão SEFAZ 4.00).
 *  - Aplicar o transform "enveloped-signature" para excluir a própria assinatura da digest.
 *
 * A chave privada é descriptografada em memória a partir do PFX, utilizada e descartada.
 * A senha nunca é persistida — gerenciada pelo Secret Manager via CertificadoService.
 */
@Injectable()
export class AssinaturaService {
  constructor(private readonly certificado: CertificadoService) {}

  /**
   * Assina o <infNFe> de uma NF-e/NFC-e.
   * @param xml XML não assinado contendo <NFe><infNFe Id="NFe...">...</infNFe></NFe>
   * @param empresaId Identificador da empresa (para localizar o certificado)
   */
  async assinarNfe(xml: string, empresaId: string): Promise<string> {
    return this.assinarElemento(xml, 'infNFe', empresaId, 'NFe');
  }

  /**
   * Assina o <infEvento> de um evento (cancelamento, CC-e).
   */
  async assinarEvento(xml: string, empresaId: string): Promise<string> {
    return this.assinarElemento(xml, 'infEvento', empresaId, 'envEvento');
  }

  /**
   * Assina o <infInut> de uma inutilização.
   */
  async assinarInutilizacao(xml: string, empresaId: string): Promise<string> {
    return this.assinarElemento(xml, 'infInut', empresaId, 'inutNFe');
  }

  /**
   * Núcleo de assinatura — localiza o elemento alvo por tag local e aplica XMLDSig.
   */
  private async assinarElemento(
    xml: string,
    elemento: string,
    empresaId: string,
    raizEsperada: string,
  ): Promise<string> {
    if (!xml || !xml.includes(`<${elemento}`)) {
      throw new BadRequestException(`XML inválido para assinatura: elemento <${elemento}> não encontrado`);
    }

    const chavePrivada = await this.obterChavePrivadaPem(empresaId);

    const sig = new xmlCrypto.SignedXml({
      privateKey: chavePrivada.pem,
      publicCert: chavePrivada.cert,
      signatureAlgorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
      canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
      implicitTransforms: [],
    });

    sig.addReference({
      xpath: `//*[local-name(.)='${elemento}']`,
      digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1',
      transforms: [
        'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
        'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
      ],
    });

    sig.computeSignature(xml, {
      prefix: 'ds',
      location: { reference: `//*[local-name(.)='${elemento}']`, action: 'after' },
      existingPrefixes: { ds: 'http://www.w3.org/2000/09/xmldsig#' },
    });

    return sig.getSignedXml();
  }

  /**
   * Carrega o PFX, extrai chave privada e certificado em PEM, e descarta o buffer.
   */
  private async obterChavePrivadaPem(
    empresaId: string,
  ): Promise<{ pem: string; cert: string }> {
    const { pfxBuffer, senha } = await this.certificado.carregarParaAssinatura(empresaId);
    try {
      const forge = require('node-forge');
      const asn1 = forge.asn1.fromDer(pfxBuffer.toString('binary'));
      const pfx = forge.pkcs12.pkcs12FromAsn1(asn1, senha);

      const keyBags = pfx.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
      const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
      if (!keyBag?.key) {
        throw new InternalServerErrorException({ code: 'CERTIFICADO_AUSENTE', message: 'Chave privada não encontrada no PFX' });
      }

      const certBags = pfx.getBags({ bagType: forge.pki.oids.certBag });
      const certBag = certBags[forge.pki.oids.certBag]?.[0];
      if (!certBag?.cert) {
        throw new InternalServerErrorException({ code: 'CERTIFICADO_AUSENTE', message: 'Certificado não encontrado no PFX' });
      }

      const pem = forge.pki.privateKeyToPem(keyBag.key);
      const cert = forge.pki.certificateToPem(certBag.cert);

      return { pem, cert };
    } catch (err) {
      if (err instanceof InternalServerErrorException) throw err;
      throw new InternalServerErrorException({ code: 'CERTIFICADO_AUSENTE', message: 'Falha ao descriptografar certificado', details: (err as Error).message });
    } finally {
      // Descarte defensivo — pendência: zero-fill do buffer binário.
      try { pfxBuffer.fill(0); } catch { /* ignore */ }
    }
  }
}