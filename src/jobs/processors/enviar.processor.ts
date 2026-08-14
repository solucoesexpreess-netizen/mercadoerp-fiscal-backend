import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { EmissaoPipelineService } from '../../nfe/services/emissao-pipeline.service';

/**
 * EnviarProcessor — processa a fila nfe.enviar executando o pipeline síncrono
 * de emissão: gerar XML → validar XSD → assinar → transmitir SEFAZ → atualizar
 * status/protocolo → gerar DANFE.
 *
 * O pipeline é delegado ao EmissaoPipelineService, mantendo o processor focado
 * apenas no lifecycle da fila (retentativas, eventos de worker, DLQ).
 */
@Processor('nfe.enviar', { concurrency: 5 })
export class EnviarProcessor extends WorkerHost {
  private readonly logger = new Logger('EnviarProcessor');

  constructor(private readonly pipeline: EmissaoPipelineService) {
    super();
  }

  async process(job: Job<{ notaId: string; empresaId: string }>) {
    const { notaId, empresaId } = job.data;
    this.logger.log(`Processando envio da nota ${notaId}`);

    try {
      const resultado = await this.pipeline.processar(notaId, empresaId);
      this.logger.log(`Nota ${notaId} → ${resultado.status} (cStat ${resultado.cStat})`);
      return { notaId, status: resultado.status, cStat: resultado.cStat };
    } catch (err) {
      this.logger.error(`Falha no pipeline da nota ${notaId}: ${(err as Error).message}`);
      throw err; // BullMQ aplica backoff/retentativas conforme configurado
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(`Job ${job.id} falhou (attempt ${job.attemptsMade}): ${err.message}`);
  }
}