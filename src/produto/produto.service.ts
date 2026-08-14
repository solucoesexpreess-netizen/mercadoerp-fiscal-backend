import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { Produto } from './entities/produto.entity';
import { AuthUser } from '../common/decorators/current-user.decorator';

@Injectable()
export class ProdutoService {
  constructor(@InjectRepository(Produto) private readonly repo: Repository<Produto>) {}

  create(dto: Partial<Produto>, user: AuthUser) {
    return this.repo.save(this.repo.create({ ...dto, empresaId: user.empresaId }));
  }

  findAll(user: AuthUser, query: { q?: string; page?: number; limit?: number }) {
    const page = Number(query.page || 1);
    const limit = Number(query.limit || 20);
    return this.repo.findAndCount({
      where: { empresaId: user.empresaId, ...(query.q ? { nome: Like(`%${query.q}%`) } : {}) },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    }).then(([data, total]) => ({ data, meta: { page, limit, total } }));
  }
}