import {
  Injectable, NotFoundException, ConflictException, BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Nota } from './entities/nota.entity';
import { Numeracao } from './entities/numeracao.entity';
import { Empresa } from '../empresa/entities/empresa.entity';
import { gerarChaveAcesso } from './utils/chave';
import { NfeEmissaoDto } from './dto/nfe.dto';
import { NfeQueue } from '../jobs/nfe.queue';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { EmissaoPipelineService } from './services/emissao-pipeline.service';

// Erros de negócio com código do contrato
class ValidationError extends BadRequestException {
  constructor(details: string[]) { super({ code: 'VALIDATION_ERROR', message: 'Dados obrigatórios ausentes', details }); }
}

@Injectable()
export class NfeService {
  constructor(
    @InjectRepository(Nota) private readonly notas: Repository<Nota>,
    @InjectRepository(Numeracao) private readonly numeracoes: Repository<Numeracao>,
    @InjectRepository(Empresa) private readonly empresas: Repository<Empresa>,
    private readonly dataSource: DataSource,
    private readonly queue: NfeQueue,
    private readonly pipeline: EmissaoPipelineService,
  ) {}

  // POST /nfe — valida, aloca número, gera chave, cria RASCUNHO (e opcionalmente enfileira)
  async emitir(dto: NfeEmissaoDto, user: AuthUser) {
    const empresaId = dto.empresaId ?? user.empresaId;
    if (dto.empresaId && dto.empresaId !== user.empresaId && user.role !== 'dono') {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Apenas dono pode emitir para outra empresa' });
    }

    const empresa = await this.empresas.findOne({ where: { id: empresaId } });
    if (!empresa) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Empresa não encontrada' });

    const erros: string[] = [];
    if (!dto.itens?.length) erros.push('Itens obrigatórios');
    if (dto.itens.some((i) => !i.quantidade || i.quantidade <= 0)) erros.push('Quantidade inválida');
    const valorTotal = dto.itens.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0);
    if (valorTotal <= 0) erros.push('Valor total inválido');
    if (!empresa.uf) erros.push('UF do emissor não configurada');
    if (!empresa.cnpj) erros.push('CNPJ do emissor não configurado');
    if (erros.length) throw new ValidationError(erros);

    // Alocação concorrente-safe dentro de transação com lock otimista (version)
    const numero = await this.dataSource.transaction(async (em) => {
      let numeracao = await em.findOne(Numeracao, {
        where: { empresaId, serie: dto.serie, modelo: dto.modelo as '55' | '65' },
      });
      if (!numeracao) {
        numeracao = em.create(Numeracao, { empresaId, serie: dto.serie, modelo: dto.modelo as '55' | '65', ultimoNumero: 0, ano: new Date().getFullYear(), version: 1 });
        await em.save(numeracao);
      }
      const proximo = numeracao.ultimoNumero + 1;
      const result = await em.update(Numeracao, { id: numeracao.id, version: numeracao.version }, { ultimoNumero: proximo, version: numeracao.version + 1 });
      if (result.affected === 0) {
        throw new ConflictException({ code: 'CONFLITO_NUMERACAO', message: 'Concorrência na numeração — tente novamente' });
      }
      return proximo;
    });

    const dataEmissao = new Date();
    const chave = gerarChaveAcesso({
      uf: empresa.uf, dataEmissao, cnpj: empresa.cnpj, modelo: dto.modelo,
      serie: dto.serie, numero,
    });

    const enviar = dto.enviar !== false;
    const nota = await this.notas.save(
      this.notas.create({
        empresaId, clienteId: dto.clienteId ?? null, numero: String(numero), serie: dto.serie,
        modelo: dto.modelo, chave, formaEmissao: '1', valorTotal, dataEmissao,
        ambiente: empresa.ambiente, status: enviar ? 'FILA_ENVIO' : 'RASCUNHO',
      }),
    );

    if (enviar) {
      await this.queue.enfileirarEnvio(nota.id, empresaId);
    }
    return { id: nota.id, status: nota.status, fila: enviar ? 'enviado' : 'rascunho', chave };
  }

  async findAll(user: AuthUser, query: { status?: string; page?: number; limit?: number }) {
    const page = Number(query.page || 1);
    const limit = Number(query.limit || 20);
    const [data, total] = await this.notas.findAndCount({
      where: { empresaId: user.empresaId, ...(query.status ? { status: query.status as Nota['status'] } : {}) },
      order: { dataEmissao: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, meta: { page, limit, total } };
  }

  async findOne(id: string, user: AuthUser) {
    const nota = await this.notas.findOne({ where: { id, empresaId: user.empresaId } });
    if (!nota) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Nota não encontrada' });
    return nota;
  }

  // POST /nfe/:id/enviar — move RASCUNHO/VALIDADA → FILA_ENVIO
  async enviar(id: string, user: AuthUser) {
    const nota = await this.findOne(id, user);
    if (nota.status !== 'RASCUNHO' && nota.status !== 'VALIDADA') {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: `Não é possível enviar nota em ${nota.status}` });
    }
    nota.status = 'FILA_ENVIO';
    await this.notas.save(nota);
    await this.queue.enfileirarEnvio(nota.id, user.empresaId);
    return { id: nota.id, status: nota.status };
  }

  async status(id: string, user: AuthUser) {
    const nota = await this.findOne(id, user);
    const autorizada = nota.status === 'AUTORIZADA';
    return {
      status: nota.status,
      protocolo: nota.protocolo,
      chave: nota.chave,
      ...(autorizada ? { xml: null, danfe: null } : {}), // preenchido por Storage nas fases seguintes
    };
  }

  // POST /nfe/:id/cancelar — evento 110111 (SEFAZ — pendência Backend)
  async cancelar(id: string, dto: { justificativa: string }, user: AuthUser) {
    const nota = await this.findOne(id, user);
    if (nota.status !== 'AUTORIZADA') {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Apenas notas autorizadas podem ser canceladas' });
    }
    if (dto.justificativa.length < 15 || dto.justificativa.length > 255) {
      throw new ValidationError(['Justificativa deve ter entre 15 e 255 caracteres']);
    }
    // Gera o XML do evento de cancelamento, assina e transmite à SEFAZ (pipeline síncrono)
    const resultado = await this.pipeline.cancelar(id, user.empresaId, dto.justificativa);
    return { id, status: resultado.status as 'CANCELADA', protocolo: resultado.protocolo ?? '' };
  }

  // POST /nfe/:id/cce — carta de correção 110110
  async cce(id: string, dto: { correcoes: Array<{ grupo: string; campo: string; valor: string }> }, user: AuthUser) {
    const resultado = await this.pipeline.cce(id, user.empresaId, dto.correcoes);
    return { eventoId: '', sequencia: 1, protocolo: resultado.protocolo ?? null };
  }

  // POST /nfe/inutilizar
  async inutilizar(dto: { serie: string; modelo: '55' | '65'; numeroInicial: number; numeroFinal: number; justificativa: string }, user: AuthUser) {
    const resultado = await this.pipeline.inutilizar(user.empresaId, dto);
    return { protocolo: resultado.protocolo ?? '', faixa: `${dto.numeroInicial}-${dto.numeroFinal}` };
  }
}