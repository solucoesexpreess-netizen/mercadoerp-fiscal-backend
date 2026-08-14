import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Nota } from './entities/nota.entity';
import { Numeracao } from './entities/numeracao.entity';
import { Empresa } from '../empresa/entities/empresa.entity';
import { NfeService } from './nfe.service';
import { NfeController } from './nfe.controller';
import { JobsModule } from '../jobs/jobs.module';
import { JwtModule } from '@nestjs/jwt';
import { FiscalCoreModule } from './fiscal-core.module';

@Module({
  imports: [TypeOrmModule.forFeature([Nota, Numeracao, Empresa]), JwtModule, JobsModule, FiscalCoreModule],
  controllers: [NfeController],
  providers: [NfeService],
})
export class NfeModule {}