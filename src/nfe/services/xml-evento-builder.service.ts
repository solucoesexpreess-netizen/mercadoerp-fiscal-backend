import { Injectable, BadRequestException } from '@nestjs/common';
import { create } from 'xmlbuilder2';
import { ChaveAcessoService } from './chave-acesso.service';
import { UF_CODES } from './sefaz-urls';

/**
 * XmlEventoBuilderService — gera o XML dos eventos fiscais conforme MOC 4.00:
 *  - Cancelamento (tpEvento 110111)
 *  - Carta de Correção Eletrônica — CC-e (tpEvento 110110)
 *  - Inutilização de numeração (nfeInutilizacao — não é evento, é mensagem própria)
 *
 * Estrutura do evento (NT 2012/003 e 2018/005):
 *   <envEvento versao="1.00">
 *     <idLote>...</idLote>
 *     <evento versao="1.00">
 *       <infEvento Id="ID{tpEvento}{chave}{nSeqEvento}">
 *         <cOrgao>...</cOrgao>  <tpAmb>...</tpAmb>  <CNPJ>...</CNPJ>
 *         <chNFe>...</chNFe>  <dhEvento>...</dhEvento>  <tpEvento>...</tpEvento>
 *         <nSeqEvento>...</nSeqEvento>
 *         <verEvento>1.00</verEvento>
 *         <detEvento versao="...">
 *           ... (específico do tipo de evento)
 *         </detEvento>
 *       </infEvento>
 *     </evento>
 *   </envEvento>
 */

export interface CancelamentoEventoInput {
  chave: string;
  justificativa: string; // 15..255
  cnpjEmitente: string;
  ambiente: 'homologacao' | 'producao';
  uf: string;
  protocoloAutorizacao: string;
  sequencia?: number;
  dhEvento?: Date;
}

export interface CceEventoInput {
  chave: string;
  cnpjEmitente: string;
  ambiente: 'homologacao' | 'producao';
  uf: string;
  correcoes: Array<{ grupo: string; campo: string; valor: string }>;
  sequencia?: number;
  dhEvento?: Date;
}

export interface InutilizacaoInput {
  cnpjEmitente: string;
  ambiente: 'homologacao' | 'producao';
  uf: string;
  serie: string;
  modelo: '55' | '65';
  numeroInicial: number;
  numeroFinal: number;
  justificativa: string; // 15..255
  ano: number;
}

export interface EventoGerado {
  xml: string;        // XML do lote de evento (não assinado)
  idLote: string;
  idEvento: string;    // ID da infEvento (para referência da assinatura)
}

@Injectable()
export class XmlEventoBuilderService {
  constructor(private readonly chaveService: ChaveAcessoService) {}

  /**
   * Cancelamento — evento 110111.
   */
  gerarCancelamento(input: CancelamentoEventoInput): EventoGerado {
    this.validarJustificativa(input.justificativa);
    this.validarProtocolo(input.protocoloAutorizacao);
    const nSeq = input.sequencia ?? 1;
    const idEvento = `ID110111${input.chave}${String(nSeq).padStart(2, '0')}`;
    const dh = (input.dhEvento ?? new Date()).toISOString();
    const cOrgao = UF_CODES[input.uf.toUpperCase()] ?? '91';

    const doc = create({ version: '1.0', encoding: 'UTF-8', standalone: false })
      .ele('envEvento', { xmlns: 'http://www.portalfiscal.inf.br/nfe', versao: '1.00' })
        .ele('idLote').txt(this.gerarIdLote()).up()
        .ele('evento', { versao: '1.00' })
          .ele('infEvento', { Id: idEvento })
            .ele('cOrgao').txt(cOrgao).up()
            .ele('tpAmb').txt(input.ambiente === 'producao' ? '1' : '2').up()
            .ele('CNPJ').txt(input.cnpjEmitente).up()
            .ele('chNFe').txt(input.chave).up()
            .ele('dhEvento').txt(dh).up()
            .ele('tpEvento').txt('110111').up()
            .ele('nSeqEvento').txt(String(nSeq)).up()
            .ele('verEvento').txt('1.00').up()
            .ele('detEvento', { versao: '1.00' })
              .ele('descEvento').txt('Cancelamento').up()
              .ele('nProt').txt(input.protocoloAutorizacao).up()
              .ele('xJust').txt(this.esc(input.justificativa)).up()
            .up()
          .up()
        .up()
      .up();

    return { xml: doc.end({ prettyPrint: true, headless: true }), idLote: '', idEvento };
  }

  /**
   * Carta de Correção Eletrônica — evento 110110.
   */
  gerarCce(input: CceEventoInput): EventoGerado {
    const nSeq = input.sequencia ?? 1;
    const idEvento = `ID110110${input.chave}${String(nSeq).padStart(2, '0')}`;
    const dh = (input.dhEvento ?? new Date()).toISOString();
    const cOrgao = UF_CODES[input.uf.toUpperCase()] ?? '91';

    const doc = create({ version: '1.0', encoding: 'UTF-8', standalone: false })
      .ele('envEvento', { xmlns: 'http://www.portalfiscal.inf.br/nfe', versao: '1.00' })
        .ele('idLote').txt(this.gerarIdLote()).up()
        .ele('evento', { versao: '1.00' })
          .ele('infEvento', { Id: idEvento })
            .ele('cOrgao').txt(cOrgao).up()
            .ele('tpAmb').txt(input.ambiente === 'producao' ? '1' : '2').up()
            .ele('CNPJ').txt(input.cnpjEmitente).up()
            .ele('chNFe').txt(input.chave).up()
            .ele('dhEvento').txt(dh).up()
            .ele('tpEvento').txt('110110').up()
            .ele('nSeqEvento').txt(String(nSeq)).up()
            .ele('verEvento').txt('1.00').up()
            .ele('detEvento', { versao: '1.00' })
              .ele('descEvento').txt('Carta de Correcao').up()
              .ele('xCorrecao').txt(this.esc(input.correcoes.map((c) => `${c.grupo}.${c.campo}=${c.valor}`).join('; '))).up()
            .up()
          .up()
        .up()
      .up();

    return { xml: doc.end({ prettyPrint: true, headless: true }), idLote: '', idEvento };
  }

  /**
   * Inutilização de numeração — mensagem nfeInutilizacao (não é evento <envEvento>).
   * Estrutura: <inutNFe versao="4.00"><infInut Id="ID{cUF}{ano}{CNPJ}{mod}{serie}{nIni}{nFin}">
   */
  gerarInutilizacao(input: InutilizacaoInput): EventoGerado {
    this.validarJustificativa(input.justificativa);
    const cUF = UF_CODES[input.uf.toUpperCase()] ?? '91';
    const ano2 = String(input.ano).slice(-2);
    const cnpj = input.cnpjEmitente.replace(/\D/g, '').padStart(14, '0').slice(0, 14);
    const mod = String(input.modelo).padStart(2, '0');
    const serie = String(input.serie).padStart(3, '0');
    const nIni = String(input.numeroInicial).padStart(9, '0');
    const nFin = String(input.numeroFinal).padStart(9, '0');
    const idInut = `ID${cUF}${ano2}${cnpj}${mod}${serie}${nIni}${nFin}`;

    const doc = create({ version: '1.0', encoding: 'UTF-8', standalone: false })
      .ele('inutNFe', { xmlns: 'http://www.portalfiscal.inf.br/nfe', versao: '4.00' })
        .ele('infInut', { Id: idInut })
          .ele('tpAmb').txt(input.ambiente === 'producao' ? '1' : '2').up()
          .ele('xServ').txt('INUTILIZAR').up()
          .ele('cUF').txt(cUF).up()
          .ele('ano').txt(ano2).up()
          .ele('CNPJ').txt(cnpj).up()
          .ele('mod').txt(mod).up()
          .ele('serie').txt(serie).up()
          .ele('nNFIni').txt(nIni).up()
          .ele('nNFFin').txt(nFin).up()
          .ele('xJust').txt(this.esc(input.justificativa)).up()
        .up()
      .up();

    return { xml: doc.end({ prettyPrint: true, headless: true }), idLote: '', idEvento: idInut };
  }

  private gerarIdLote(): string {
    return String(Date.now()) + String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  }

  private validarJustificativa(j: string) {
    if (!j || j.length < 15 || j.length > 255) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Justificativa deve ter entre 15 e 255 caracteres' });
    }
  }

  private validarProtocolo(p: string) {
    if (!p || !/^\d{15}$/.test(p)) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Protocolo de autorização inválido (15 dígitos)' });
    }
  }

  private esc(s: string): string {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}