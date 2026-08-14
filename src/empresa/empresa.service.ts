import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Empresa } from './entities/empresa.entity';
import { AuthUser } from '../common/decorators/current-user.decorator';

@Injectable()
export class EmpresaService {
  constructor(@InjectRepository(Empresa) private readonly repo: Repository<Empresa>) {}

  findOne(user: AuthUser) {
    return this.repo.findOne({ where: { id: user.empresaId }, select: ['id', 'cnpj', 'ie', 'razaoSocial', 'crt', 'uf', 'ambiente', 'regime'] });
  }

  async update(dto: Partial<Empresa>, user: AuthUser) {
    const empresa = await this.findOne(user);
    if (!empresa) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Empresa não encontrada' });
    Object.assign(empresa, dto);
    return this.repo.save(empresa);
  }
}