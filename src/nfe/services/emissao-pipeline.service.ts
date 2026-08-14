import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';

import { Nota } from '../entities/nota.entity';
import { NotaItem } from '../entities/nota-item.entity';
import { Pagamento } from '../entities/pagamento.entity';
import { Evento } from '../entities/evento.entity';
import { XmlNota } from '../entities/xml-nota.entity';
import { DanfeEntity } from '../entities/danfe.entity';
import { Empresa } from '../../empresa/entities/empresa.entity';
import { Cliente } from '../../cliente/entities/cliente.entity';
import { Produto } from '../../produto/entities/produto.entity';
import { Numeracao } from '../entities/numeracao.entity';

import { XmlBuilderService, XmlBuilderInput, ItemDados, PagamentoDados } from './xml-builder.service';
import { XmlEventoBuilderService } from './xml-evento-builder.service';
import { ChaveAcessoService } from './chave-acesso.service';
import { AssinaturaService } from './assinatura.service';
import { XsdValidatorService } from './xsd-validator.service';
import { SefazService, RetornoSefaz } from './sefaz.service';
import { DanfeService, DanfeDados } from './danfe.service';
import { UF_CODES } from './sefaz-urls';

/**
 * EmissaoPipelineService — orquestra o fluxo completo de emissão de uma NF-e:
 *
 *   Carregar dados → Gerar XML → Validar XSD → Assinar → Transmitir SEFAZ
 *     → Atualizar status/protocolo → Persistir procNFe → Gerar DANFE
 *
 * Também orquestra eventos: cancelamento, CC-e e inutilização.
 * Síncrono (sem BullMQ) conforme decisão de arquitetura para a primeira nota autorizada.
 */
export interface ResultadoEmissao {
  notaId: string;
  status: string;
  protocolo?: string;
  recibo?: string;
  chave: string;
  motivo?: string;
  cStat: string;
  xmlAutorizado?: string;
  danfeUri?: string;
}

@Injectable()
export class EmissaoPipelineService {
  private readonly logger = new Logger(EmissaoPipelineService.name);

  constructor(
    @InjectRepository(Nota) private readonly notas: Repository<Nota>,
    @InjectRepository(NotaItem) private readonly itensRepo: Repository<NotaItem>,
    @InjectRepository(Pagamento) private readonly pagamentosRepo: Repository<Pagamento>,
    @InjectRepository(Evento) private readonly eventosRepo: Repository<Evento>,
    @InjectRepository(XmlNota) private readonly xmlsRepo: Repository<XmlNota>,
    @InjectRepository(DanfeEntity) private readonly danfesRepo: Repository<DanfeEntity>,
    @InjectRepository(Empresa) private readonly empresasRepo: Repository<Empresa>,
    @InjectRepository(Cliente) private readonly clientesRepo: Repository<Cliente>,
    @InjectRepository(Produto) private readonly produtosRepo: Repository<Produto>,
    @InjectRepository(Numeracao) private readonly numeracoesRepo: Repository<Numeracao>,

    private readonly xmlBuilder: XmlBuilderService,
    private readonly eventoBuilder: XmlEventoBuilderService,
    private readonly chaveService: ChaveAcessoService,
    private readonly assinatura: AssinaturaService,
    private readonly xsdValidator: XsdValidatorService,
    private readonly sefaz: SefazService,
    private readonly danfeService: DanfeService,
  ) {}

  /**
   * Executa o pipeline completo de emissão de uma NF-e já registrada (RASCUNHO/FILA_ENVIO).
   */
  async processar(notaId: string, empresaId: string): Promise<ResultadoEmissao> {
    const correlationId = randomUUID();
    const inicio = Date.now();
    this.logger.log(`[${correlationId}] Iniciando pipeline de emissão da nota ${notaId}`);

    // 1. Carregar dados
    const { nota, empresa, cliente, itens, pagamentos, produtoMap } = await this.carregarDados(notaId, empresaId);

    // 2. Gerar chave de acesso (se ainda não houver)
    if (!nota.chave) {
      nota.chave = this.chaveService.gerar({
        uf: empresa.uf,
        dataEmissao: nota.dataEmissao,
        cnpj: empresa.cnpj,
        modelo: nota.modelo,
        serie: nota.serie,
        numero: Number(nota.numero),
      });
    }

    // 3. Montar input do XmlBuilder
    const input = this.montarInput(nota, empresa, cliente, itens, pagamentos, { produtoMap });

    // 4. Gerar XML
    let xml = this.xmlBuilder.gerar(input);
    nota.status = 'XML_GERADO';
    await this.notas.save(nota);

    // 5. Validar XSD
    const validacao = this.xsdValidator.validarNfe(xml);
    if (!validacao.valido) {
      nota.status = 'REJEITADA';
      nota.motivoRejeicao = `XML inválido: ${validacao.erros.join('; ')}`;
      await this.notas.save(nota);
      this.logger.error(`[${correlationId}] XML rejeitado na validação XSD: ${validacao.erros.join('; ')}`);
      return { notaId, status: 'REJEITADA', chave: nota.chave, motivo: nota.motivoRejeicao, cStat: '999' };
    }

    // 6. Assinar
    xml = await this.assinatura.assinarNfe(xml, empresaId);
    nota.status = 'ASSINADA';
    await this.notas.save(nota);

    // Persistir XML enviado (append-only)
    await this.xmlsRepo.save(this.xmlsRepo.create({
      notaId: nota.id, chave: nota.chave, tipo: 'enviado', conteudo: xml,
    }));

    // 7. Transmitir à SEFAZ
    nota.status = 'ENVIADA';
    await this.notas.save(nota);
    const retorno = await this.sefaz.autorizar(empresaId, xml, empresa.uf, nota.modelo, empresa.ambiente);
    nota.recibo = retorno.recibo ?? nota.recibo;

    // 8. Tratar retorno
    const resultado = await this.tratarRetorno(nota, retorno, correlationId);

    this.logger.log(`[${correlationId}] Pipeline concluído em ${Date.now() - inicio}ms — status ${resultado.status} (cStat ${resultado.cStat})`);
    return resultado;
  }

  /**
   * Cancelamento de NF-e autorizada (evento 110111).
   */
  async cancelar(notaId: string, empresaId: string, justificativa: string): Promise<ResultadoEmissao> {
    const { nota, empresa } = await this.carregarDados(notaId, empresaId);
    if (nota.status !== 'AUTORIZADA') {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Apenas notas autorizadas podem ser canceladas' });
    }
    if (justificativa.length < 15 || justificativa.length > 255) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Justificativa deve ter entre 15 e 255 caracteres' });
    }

    const { xml } = this.eventoBuilder.gerarCancelamento({
      chave: nota.chave!,
      justificativa,
      cnpjEmitente: empresa.cnpj,
      ambiente: empresa.ambiente,
      uf: empresa.uf,
      protocoloAutorizacao: nota.protocolo!,
    });
    const xmlAssinado = await this.assinatura.assinarEvento(xml, empresaId);
    const retorno = await this.sefaz.receberEvento(empresaId, xmlAssinado, empresa.uf, empresa.ambiente);

    const evento = this.eventosRepo.create({
      empresaId, notaId: nota.id, chave: nota.chave, tipo: '110111',
      sequencia: 1, status: retorno.cStat === '135' || retorno.cStat === '155' ? 'autorizado' : 'rejeitado',
      protocolo: retorno.protocolo, motivo: retorno.xMotivo, xmlUri: null,
    });
    await this.eventosRepo.save(evento);

    if (retorno.cStat === '135' || retorno.cStat === '155') {
      nota.status = 'CANCELADA';
      nota.motivoRejeicao = null;
      await this.notas.save(nota);
      await this.xmlsRepo.save(this.xmlsRepo.create({ notaId: nota.id, chave: nota.chave, tipo: 'cancelado', conteudo: xmlAssinado }));
    } else {
      evento.status = 'rejeitado';
      await this.eventosRepo.save(evento);
    }

    return { notaId, status: nota.status, chave: nota.chave!, protocolo: retorno.protocolo, motivo: retorno.xMotivo, cStat: retorno.cStat };
  }

  /**
   * Carta de Correção Eletrônica (evento 110110).
   */
  async cce(notaId: string, empresaId: string, correcoes: Array<{ grupo: string; campo: string; valor: string }>): Promise<ResultadoEmissao> {
    const { nota, empresa } = await this.carregarDados(notaId, empresaId);
    if (nota.status !== 'AUTORIZADA' && nota.status !== 'CANCELADA') {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'CC-e apenas para notas autorizadas' });
    }
    const seq = await this.proximaSequenciaEvento(nota.id);

    const { xml } = this.eventoBuilder.gerarCce({
      chave: nota.chave!,
      cnpjEmitente: empresa.cnpj,
      ambiente: empresa.ambiente,
      uf: empresa.uf,
      correcoes,
      sequencia: seq,
    });
    const xmlAssinado = await this.assinatura.assinarEvento(xml, empresaId);
    const retorno = await this.sefaz.receberEvento(empresaId, xmlAssinado, empresa.uf, empresa.ambiente);

    const evento = this.eventosRepo.create({
      empresaId, notaId: nota.id, chave: nota.chave, tipo: '110110', sequencia: seq,
      status: retorno.cStat === '135' ? 'autorizado' : 'rejeitado',
      protocolo: retorno.protocolo, motivo: retorno.xMotivo, xmlUri: null,
    });
    await this.eventosRepo.save(evento);
    if (retorno.cStat === '135') {
      await this.xmlsRepo.save(this.xmlsRepo.create({ notaId: nota.id, chave: nota.chave, tipo: 'cce', conteudo: xmlAssinado }));
    }

    return { notaId, status: nota.status, chave: nota.chave!, protocolo: retorno.protocolo, motivo: retorno.xMotivo, cStat: retorno.cStat };
  }

  /**
   * Inutilização de faixa de numeração.
   */
  async inutilizar(empresaId: string, dto: { serie: string; modelo: '55' | '65'; numeroInicial: number; numeroFinal: number; justificativa: string }): Promise<ResultadoEmissao> {
    const empresa = await this.empresasRepo.findOne({ where: { id: empresaId } });
    if (!empresa) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Empresa não encontrada' });
    if (dto.justificativa.length < 15 || dto.justificativa.length > 255) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Justificativa deve ter entre 15 e 255 caracteres' });
    }

    const { xml } = this.eventoBuilder.gerarInutilizacao({
      cnpjEmitente: empresa.cnpj,
      ambiente: empresa.ambiente,
      uf: empresa.uf,
      serie: dto.serie,
      modelo: dto.modelo,
      numeroInicial: dto.numeroInicial,
      numeroFinal: dto.numeroFinal,
      justificativa: dto.justificativa,
      ano: new Date().getFullYear(),
    });
    const xmlAssinado = await this.assinatura.assinarInutilizacao(xml, empresaId);
    const retorno = await this.sefaz.inutilizar(empresaId, xmlAssinado, empresa.uf, empresa.ambiente);

    if (retorno.cStat === '102' || retorno.cStat === '563') {
      await this.eventosRepo.save(this.eventosRepo.create({
        empresaId, notaId: null, chave: null, tipo: '110111', sequencia: 1,
        status: 'autorizado', protocolo: retorno.protocolo, motivo: retorno.xMotivo,
      }));
      await this.xmlsRepo.save(this.xmlsRepo.create({ notaId: null, chave: null, tipo: 'inutilizacao', conteudo: xmlAssinado }));
    }

    return { notaId: '', status: retorno.cStat === '102' ? 'INUTILIZADA' : 'REJEITADA', chave: '', protocolo: retorno.protocolo, motivo: retorno.xMotivo, cStat: retorno.cStat };
  }

  /**
   * Consulta o status de uma NF-e na SEFAZ (necessário em processamento assíncrono).
   */
  async consultarProtocolo(notaId: string, empresaId: string): Promise<RetornoSefaz> {
    const { nota, empresa } = await this.carregarDados(notaId, empresaId);
    return this.sefaz.consultarProtocolo(empresaId, nota.chave!, empresa.uf, empresa.ambiente);
  }

  // ─────────────────────────────────────────────
  // Internos
  // ─────────────────────────────────────────────

  private async carregarDados(notaId: string, empresaId: string) {
    const nota = await this.notas.findOne({ where: { id: notaId, empresaId } });
    if (!nota) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Nota não encontrada' });

    const empresa = await this.empresasRepo.findOne({ where: { id: empresaId } });
    if (!empresa) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Empresa não encontrada' });

    const cliente = nota.clienteId ? await this.clientesRepo.findOne({ where: { id: nota.clienteId } }) : null;

    const itens = await this.itensRepo.find({ where: { notaId } });
    if (!itens.length) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Nota sem itens' });

    const pagamentos = await this.pagamentosRepo.find({ where: { notaId } });
    const produtoIds = itens.map((i) => i.produtoId).filter(Boolean) as string[];
    const produtos = produtoIds.length ? await this.produtosRepo.findByIds(produtoIds) : [];
    const produtoMap = new Map(produtos.map((p) => [p.id, p]));

    return { nota, empresa, cliente, itens, pagamentos, produtoMap };
  }

  private _unused() { return this.produtosRepo; }

  private montarInput(
    nota: Nota,
    empresa: Empresa,
    cliente: Cliente | null,
    itens: NotaItem[],
    pagamentos: Pagamento[],
    data: { produtoMap: Map<string, Produto> },
  ): XmlBuilderInput {
    const cMunEmit = this.codigoMunicipioIbge(empresa);

    const itensXml: ItemDados[] = itens.map((it, idx) => {
      const produto = it.produtoId ? data.produtoMap.get(it.produtoId) : undefined;
      return {
        numero: idx + 1,
        produto: {
          codigo: it.produtoId ?? String(idx + 1),
          codigoBarras: produto?.codigoBarras ?? null,
          nome: it.produtoNome,
          ncm: it.ncm,
          cest: produto?.cest ?? null,
          cfop: it.cfop,
          unidade: (produto?.unidade ?? 'un') as string,
          valorUnitario: Number(it.valorUnitario),
          quantidade: Number(it.quantidade),
        },
        tributacao: {
          cst: it.cst,
          csosn: it.csosn ?? (empresa.crt === '1' ? '102' : undefined),
          origem: it.origem,
          cfop: it.cfop,
          ncm: it.ncm,
          cest: produto?.cest ?? undefined,
          aliqIcms: Number(it.aliqIcms),
          aliqPis: Number(it.aliqPis),
          aliqCofins: Number(it.aliqCofins),
          aliqIpi: Number(it.aliqIpi),
        },
      };
    });

    const pagamentosXml: PagamentoDados[] = pagamentos.length
      ? pagamentos.map((p) => ({ forma: p.forma as PagamentoDados['forma'], valor: Number(p.valor) }))
      : [{ forma: 'SEM_PAGAMENTO', valor: Number(nota.valorTotal) }];

    return {
      chave: nota.chave!,
      numero: Number(nota.numero),
      serie: nota.serie,
      modelo: nota.modelo,
      dataEmissao: nota.dataEmissao,
      naturezaOperacao: 'VENDA DE MERCADORIA',
      formaEmissao: nota.formaEmissao || '1',
      finalidade: '1',
      indicadorPresenca: nota.modelo === '65' ? '1' : '0',
      ambiente: empresa.ambiente,
      emitente: {
        cnpj: empresa.cnpj,
        razaoSocial: empresa.razaoSocial,
        ie: empresa.ie ?? '',
        crt: empresa.crt,
        endereco: {
          logradouro: 'NÃO INFORMADO',
          numero: 'S/N',
          bairro: 'CENTRO',
          codigoMunicipio: cMunEmit,
          municipio: 'NÃO INFORMADO',
          uf: empresa.uf,
          cep: '00000000',
        },
      },
      destinatario: cliente
        ? {
            cpfCnpj: cliente.cpfCnpj,
            nome: cliente.nome,
            endereco: cliente.municipio
              ? {
                  logradouro: cliente.logradouro ?? 'NÃO INFORMADO',
                  numero: cliente.numero ?? 'S/N',
                  complemento: cliente.complemento ?? undefined,
                  bairro: cliente.bairro ?? 'CENTRO',
                  codigoMunicipio: '9999999',
                  municipio: cliente.municipio,
                  uf: cliente.uf ?? empresa.uf,
                  cep: cliente.cep ?? '00000000',
                }
              : null,
            indIEDest: '9',
            email: cliente.email ?? undefined,
          }
        : null,
      itens: itensXml,
      pagamentos: pagamentosXml,
      transporte: { modFrete: '9' },
      informacoesAdicionais: undefined,
    };
  }

  private codigoMunicipioIbge(empresa: Empresa): string {
    // Pendência: a tabela empresas não possui código IBGE do município.
    // Em produção, adicionar coluna cMun. Por ora, usamos placeholder válido.
    return '3550308'; // São Paulo (placeholder)
  }

  private async tratarRetorno(nota: Nota, retorno: RetornoSefaz, correlationId: string): Promise<ResultadoEmissao> {
    const cStat = retorno.cStat;

    // 100 = autorizada, 150 = autorizada fora prazo, 110 = denegada
    if (cStat === '100' || cStat === '150') {
      nota.status = 'AUTORIZADA';
      nota.protocolo = retorno.protocolo ?? nota.protocolo;
      nota.motivoRejeicao = null;
      await this.notas.save(nota);

      // Persistir procNFe (XML autorizado)
      let xmlAutorizado: string | undefined;
      if (retorno.xmlRetorno) {
        const proc = `<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">${retorno.xmlRetorno}</nfeProc>`;
        xmlAutorizado = proc;
        await this.xmlsRepo.save(this.xmlsRepo.create({
          notaId: nota.id, chave: nota.chave, tipo: 'autorizado', conteudo: proc,
        }));
      }

      // Gerar DANFE
      let danfeUri: string | undefined;
      try {
        const danfe = await this.gerarDanfe(nota);
        danfeUri = danfe.uri;
      } catch (err) {
        this.logger.warn(`[${correlationId}] Falha ao gerar DANFE: ${(err as Error).message}`);
      }

      return { notaId: nota.id, status: 'AUTORIZADA', protocolo: nota.protocolo ?? undefined, chave: nota.chave!, cStat, xmlAutorizado, danfeUri };
    }

    if (cStat === '110' || cStat === '301' || cStat === '302') {
      nota.status = 'DENEGADA';
      nota.motivoRejeicao = retorno.xMotivo;
      await this.notas.save(nota);
      return { notaId: nota.id, status: 'DENEGADA', chave: nota.chave!, motivo: retorno.xMotivo, cStat };
    }

    // Demais cStat = rejeição
    nota.status = 'REJEITADA';
    nota.motivoRejeicao = `${cStat} - ${retorno.xMotivo}`;
    await this.notas.save(nota);
    this.logger.warn(`[${correlationId}] Nota rejeitada: ${nota.motivoRejeicao}`);
    return { notaId: nota.id, status: 'REJEITADA', chave: nota.chave!, motivo: nota.motivoRejeicao, cStat };
  }

  private async gerarDanfe(nota: Nota): Promise<DanfeEntity> {
    const empresa = await this.empresasRepo.findOne({ where: { id: nota.empresaId } });
    const itens = await this.itensRepo.find({ where: { notaId: nota.id } });
    const pagamentos = await this.pagamentosRepo.find({ where: { notaId: nota.id } });
    const cliente = nota.clienteId ? await this.clientesRepo.findOne({ where: { id: nota.clienteId } }) : null;

    const dados: DanfeDados = {
      chave: nota.chave!,
      numero: nota.numero,
      serie: nota.serie,
      modelo: nota.modelo,
      dataEmissao: nota.dataEmissao,
      naturezaOperacao: 'VENDA DE MERCADORIA',
      protocolo: nota.protocolo ?? undefined,
      ambiente: nota.ambiente,
      emitente: {
        razaoSocial: empresa!.razaoSocial,
        cnpj: empresa!.cnpj,
        ie: empresa!.ie ?? '',
        endereco: 'NÃO INFORMADO',
        municipio: 'NÃO INFORMADO',
        uf: empresa!.uf,
        cep: '00000000',
      },
      destinatario: cliente
        ? { nome: cliente.nome, cpfCnpj: cliente.cpfCnpj, endereco: cliente.logradouro, municipio: cliente.municipio, uf: cliente.uf }
        : null,
      itens: itens.map((i) => ({
        codigo: i.produtoId ?? '-',
        nome: i.produtoNome,
        ncm: i.ncm,
        cfop: i.cfop,
        unidade: 'un',
        quantidade: Number(i.quantidade),
        valorUnitario: Number(i.valorUnitario),
        valorTotal: Number(i.valorTotal),
      })),
      total: {
        valorProdutos: Number(nota.valorTotal),
        valorTotal: Number(nota.valorTotal),
        desconto: 0,
        frete: 0,
        outras: 0,
      },
      pagamento: pagamentos.map((p) => ({ forma: p.forma, valor: Number(p.valor) })),
    };

    const pdf = await this.danfeService.gerarPdf(dados);
    // Pendência: upload para S3/R2. Por ora, armazenamos URI lógica.
    const uri = `storage://danfes/${nota.chave}.pdf`;
    // Persiste metadados; o binário seria enviado ao storage em produção.
    void pdf;
    return this.danfesRepo.save(this.danfesRepo.create({ notaId: nota.id, chave: nota.chave!, uri }));
  }

  private async proximaSequenciaEvento(notaId: string): Promise<number> {
    const count = await this.eventosRepo.count({ where: { notaId, tipo: '110110' } });
    return count + 1;
  }
}