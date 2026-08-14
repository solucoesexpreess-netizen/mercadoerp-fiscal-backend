import { Module } from '@nestjs/common';
import { CertificadoModule } from '../certificado/certificado.module';
import { SefazService } from './sefaz.service';

@Module({
  imports: [CertificadoModule],
  providers: [SefazService],
  exports: [SefazService],
})
export class SefazModule {}