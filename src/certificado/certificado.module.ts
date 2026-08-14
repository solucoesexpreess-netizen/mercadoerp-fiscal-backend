import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';

import { Certificado } from './entities/certificado.entity';
import { Empresa } from '../empresa/entities/empresa.entity';
import { CertificadoService } from './certificado.service';
import { CertificadoController } from './certificado.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Certificado,
      Empresa,
    ]),
    MulterModule.register({
      limits: {
        fileSize: 5 * 1024 * 1024,
      },
    }),
  ],

  controllers: [
    CertificadoController,
  ],

  providers: [
    CertificadoService,
  ],

  exports: [
    CertificadoService,
  ],
})
export class CertificadoModule {}