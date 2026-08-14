import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { createHmac } from 'crypto';

/**
 * Webhook Dispatcher Service
 *
 * Notifica o Base44 quando eventos de NFC-e ocorrem.
 */
@Injectable()
export class WebhookDispatcherService {
  private readonly logger = new Logger('WebhookDispatcher');

  private readonly webhookUrl =
    process.env.BASE44_WEBHOOK_URL;

  private readonly hmacSecret =
    process.env.WEBHOOK_HMAC_SECRET ||
    'webhook-secret-key';

  constructor() {
    if (!this.webhookUrl) {
      this.logger.warn(
        'BASE44_WEBHOOK_URL não configurada. Webhooks desabilitados.',
      );
    }
  }

  /**
   * Dispara evento webhook para o Base44.
   */
  async dispatch(
    event:
      | 'nfe.criada'
      | 'nfe.autorizada'
      | 'nfe.rejeitada'
      | 'nfe.cancelada'
      | 'nfe.error',
    payload: any,
  ) {
    if (!this.webhookUrl) {
      this.logger.debug(
        `[SKIP] Webhook desabilitado. Evento: ${event}`,
      );
      return;
    }

    try {
      const timestamp = new Date().toISOString();

      const body = {
        event,
        timestamp,
        data: payload,
      };

      const signature = this.assinarPayload(body);

      this.logger.log(
        `Disparando webhook: ${event} -> ${this.webhookUrl}`,
      );

      await axios.post(
        this.webhookUrl,
        body,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Event': event,
            'X-Webhook-Signature': signature,
            'X-Webhook-Timestamp': timestamp,
          },
          timeout: 30000,
        },
      );

      this.logger.log(
        `Webhook entregue: ${event}`,
      );
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      this.logger.error(
        `Falha ao enviar webhook ${event}: ${message}`,
      );

      // Webhook não deve derrubar a operação fiscal.
    }
  }

  /**
   * NFC-e criada localmente.
   */
  async notificarNotaCriada(nota: any) {
    await this.dispatch('nfe.criada', {
      notaId: nota.id,
      chave: nota.chave,
      modelo: nota.modelo,
      numero: nota.numero,
      dataEmissao: nota.dataEmissao,
      valor: nota.valorTotal,
      pedidoExternoId: nota.referencia,
    });
  }

  /**
   * SEFAZ autorizou a NFC-e.
   */
  async notificarNotaAutorizada(
    nota: any,
    resposta: any,
  ) {
    await this.dispatch('nfe.autorizada', {
      notaId: nota.id,
      chave: nota.chave,
      protocolo: resposta.protocolo,
      statusProtocolo: resposta.statusProtocolo,
      dataAutorizacao:
        new Date().toISOString(),
      danfeUrl:
        `${process.env.API_URL}/api/v1/nfe/${nota.id}/danfe`,
      xmlUrl:
        `${process.env.API_URL}/api/v1/nfe/${nota.id}/xml`,
      pedidoExternoId: nota.referencia,
    });
  }

  /**
   * SEFAZ rejeitou a NFC-e.
   */
  async notificarNotaRejeitada(
    nota: any,
    erro: any,
  ) {
    await this.dispatch('nfe.rejeitada', {
      notaId: nota.id,
      chave: nota.chave,
      codigoErro: erro.codigoErro,
      mensagemErro: erro.mensagemErro,
      dataRejeicao:
        new Date().toISOString(),
      pedidoExternoId: nota.referencia,
    });
  }

  /**
   * NFC-e cancelada.
   */
  async notificarNotaCancelada(
    nota: any,
    protocolo: string,
  ) {
    await this.dispatch('nfe.cancelada', {
      notaId: nota.id,
      chave: nota.chave,
      protocoloCancelamento: protocolo,
      dataCancelamento:
        new Date().toISOString(),
      pedidoExternoId: nota.referencia,
    });
  }

  /**
   * Erro geral.
   */
  async notificarErro(
    notaId: string,
    erro: string,
    detalhes?: any,
  ) {
    await this.dispatch('nfe.error', {
      notaId,
      erro,
      detalhes,
      dataErro: new Date().toISOString(),
    });
  }

  /**
   * Assina payload com HMAC SHA-256.
   */
  private assinarPayload(body: any): string {
    const payload = JSON.stringify(body);

    const signature = createHmac(
      'sha256',
      this.hmacSecret,
    )
      .update(payload)
      .digest('hex');

    return `sha256=${signature}`;
  }
}