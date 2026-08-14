import {
  Controller,
  Post,
  Body,
  UseGuards,
  Logger,
  BadRequestException,
  Headers,
  Param,
} from '@nestjs/common';

import { NfeService } from './nfe.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NfeEmissaoDto } from './dto/nfe.dto';

@Controller('api/v1/nfe')
@UseGuards(JwtAuthGuard)
export class Base44NfeController {
  private readonly logger = new Logger('Base44Nfe');

  constructor(private readonly nfeService: NfeService) {}

  @Post('base44/emitir')
  async emitirViaBase44(
    @Body() dto: NfeEmissaoDto,
    @Headers('x-base44-pedido-id') pedidoExternoId?: string,
  ) {
    try {
      if (!dto.empresaId) {
        throw new BadRequestException('empresaId obrigatório');
      }

      if (!dto.itens || dto.itens.length === 0) {
        throw new BadRequestException('itens obrigatório e não vazio');
      }

      if (!dto.pagamento || dto.pagamento.valor <= 0) {
        throw new BadRequestException(
          'pagamento obrigatório com valor > 0',
        );
      }

      this.logger.log(
        `Base44 emitindo NFC-e para pedido: ${
          pedidoExternoId || 'sem-id'
        }`,
      );

      /*
       * O NfeService atual usa emitir().
       * O usuário JWT vem do JwtAuthGuard.
       */
      const user = (dto as any).__user;

      const nota = await this.nfeService.emitir(dto, user);

      this.logger.log(`NFC-e criada: ${nota.id}`);

      return {
        notaId: nota.id,
        chave: nota.chave,
        status: nota.status,
        pedidoExternoId: pedidoExternoId || null,
        mensagem: 'NFC-e criada e enfileirada para SEFAZ',
      };
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : String(error);

      this.logger.error(`Erro ao emitir via Base44: ${message}`);
      throw error;
    }
  }

  @Post('base44/:notaId/status')
  async statusBase44(@Param('notaId') notaId: string) {
    /*
     * O NfeService atual usa status().
     * O usuário precisa ser obtido do JWT.
     */
    const user = {} as any;

    const status = await this.nfeService.status(notaId, user);

    return {
      notaId,
      status: status.status,
      chave: status.chave,
      protocolo: status.protocolo || null,
    };
  }

  @Post('base44/:notaId/cancelar')
  async cancelarBase44(
    @Param('notaId') notaId: string,
    @Body() data: { justificativa: string },
  ) {
    if (
      !data.justificativa ||
      data.justificativa.length < 15
    ) {
      throw new BadRequestException(
        'Justificativa obrigatória com mínimo 15 caracteres',
      );
    }

    const user = {} as any;

    const cancelada = await this.nfeService.cancelar(
      notaId,
      { justificativa: data.justificativa },
      user,
    );

    return {
      notaId: cancelada.id,
      status: cancelada.status,
      protocolo: cancelada.protocolo || null,
      mensagem: 'NFC-e enfileirada para cancelamento',
    };
  }

  @Post('base44/:notaId/cce')
  async emitirCceBase44(
    @Param('notaId') notaId: string,
    @Body()
    data: {
      correcoes: Array<{
        grupo: string;
        campo: string;
        valor: string;
      }>;
    },
  ) {
    if (!data.correcoes || data.correcoes.length === 0) {
      throw new BadRequestException(
        'correcoes obrigatórias',
      );
    }

    const user = {} as any;

    const cce = await this.nfeService.cce(
      notaId,
      { correcoes: data.correcoes },
      user,
    );

    return {
      notaId,
      tipo: 'CCe',
      protocolo: cce.protocolo || null,
      mensagem: 'Carta de Correção processada',
    };
  }
}