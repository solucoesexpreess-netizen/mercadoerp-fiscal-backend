import { Module } from '@nestjs/common';
import { AssinaturaService } from './assinatura.service';
import { CertificadoModule } from '../certificado/certificado.module';

@Module({
  imports: [CertificadoModule],
  providers: [AssinaturaService],
  exports: [AssinaturaService],
})
export class AssinaturaModule {}