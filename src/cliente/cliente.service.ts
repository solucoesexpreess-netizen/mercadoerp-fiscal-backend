import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { Cliente } from './entities/cliente.entity';
import { AuthUser } from '../common/decorators/current-user.decorator';

@Injectable()
export class ClienteService {
  constructor(@InjectRepository(Cliente) private readonly repo: Repository<Cliente>) {}

  create(dto: Partial<Cliente>, user: AuthUser) {
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

  update(id: string, dto: Partial<Cliente>, user: AuthUser) {
    return this.repo.update({ id, empresaId: user.empresaId }, dto);
  }
}