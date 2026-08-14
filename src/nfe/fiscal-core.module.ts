import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CertificadoModule } from '../certificado/certificado.module';
import { SefazModule } from '../sefaz/sefaz.module';
import { AssinaturaModule } from '../assinatura/assinatura.module';

import { Nota } from './entities/nota.entity';
import { NotaItem } from './entities/nota-item.entity';
import { Pagamento } from './entities/pagamento.entity';
import { Evento } from './entities/evento.entity';
import { XmlNota } from './entities/xml-nota.entity';
import { DanfeEntity } from './entities/danfe.entity';

import { Empresa } from '../empresa/entities/empresa.entity';
import { Cliente } from '../cliente/entities/cliente.entity';
import { Produto } from '../produto/entities/produto.entity';
import { Numeracao } from './entities/numeracao.entity';

import { ChaveAcessoService } from './services/chave-acesso.service';
import { ImpostoBuilderService } from './services/imposto-builder.service';
import { XmlBuilderService } from './services/xml-builder.service';
import { XmlEventoBuilderService } from './services/xml-evento-builder.service';
import { XsdValidatorService } from './services/xsd-validator.service';
import { DanfeService } from './services/danfe.service';
import { EmissaoPipelineService } from './services/emissao-pipeline.service';

/**
 * FiscalCoreModule
 *
 * Agregador do módulo fiscal (NF-e 4.00).
 * Centraliza os serviços de emissão, assinatura, validação,
 * comunicação com a SEFAZ e geração de DANFE.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Nota,
      NotaItem,
      Pagamento,
      Evento,
      XmlNota,
      DanfeEntity,
      Empresa,
      Cliente,
      Produto,
      Numeracao,
    ]),

    CertificadoModule,
    SefazModule,
    AssinaturaModule,
  ],

  providers: [
    ChaveAcessoService,
    ImpostoBuilderService,
    XmlBuilderService,
    XmlEventoBuilderService,
    XsdValidatorService,
    DanfeService,
    EmissaoPipelineService,
  ],

  exports: [
    ChaveAcessoService,
    ImpostoBuilderService,
    XmlBuilderService,
    XmlEventoBuilderService,
    XsdValidatorService,
    DanfeService,
    EmissaoPipelineService,

    // Exporta os módulos, e não os providers diretamente.
    SefazModule,
    AssinaturaModule,
  ],
})
export class FiscalCoreModule {}