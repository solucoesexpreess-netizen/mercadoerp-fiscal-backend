import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

@Injectable()
export class NfeQueue {
  private readonly logger = new Logger('NfeQueue');

  private connection: IORedis;

  readonly enviar: Queue;
  readonly consulta: Queue;
  readonly danfe: Queue;

  constructor() {
    const redisUrl = process.env.REDIS_URL;

    let redisConfig: any;

    if (redisUrl) {
      this.logger.log('🔌 Redis usando REDIS_URL');

      redisConfig = redisUrl;
    } else {
      this.logger.log(
        `🔌 Redis usando REDIS_HOST=${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`,
      );

      redisConfig = {
        host: process.env.REDIS_HOST || 'localhost',
        port: Number(process.env.REDIS_PORT || 6379),

        ...(process.env.REDIS_PASSWORD && {
          password: process.env.REDIS_PASSWORD,
        }),

        ...(process.env.NODE_ENV === 'production' && {
          tls:
            process.env.REDIS_TLS === 'true'
              ? { rejectUnauthorized: false }
              : undefined,

          maxRetriesPerRequest: null,
          enableReadyCheck: false,
          enableOfflineQueue: true,

          retryStrategy: (times: number) =>
            Math.min(times * 50, 2000),
        }),

        maxRetriesPerRequest: null,
      };
    }

    this.connection = new IORedis(redisConfig);

    this.connection.on('error', (err) => {
      this.logger.error(`Redis connection error: ${err.message}`);
    });

    this.connection.on('connect', () => {
      this.logger.log('✅ Redis connected successfully');
    });

    this.connection.on('ready', () => {
      this.logger.log('✅ Redis ready');
    });

    this.enviar = new Queue('nfe.enviar', {
      connection: this.connection,
    });

    this.consulta = new Queue('nfe.consulta', {
      connection: this.connection,
    });

    this.danfe = new Queue('nfe.danfe', {
      connection: this.connection,
    });
  }

  async enfileirarEnvio(
    notaId: string,
    empresaId: string,
  ) {
    const job = await this.enviar.add(
      'enviar',
      {
        notaId,
        empresaId,
      },
      {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 10000,
        },
        removeOnComplete: true,
      },
    );

    this.logger.log(
      `Nota ${notaId} enfileirada para envio (job ${job.id})`,
    );

    return job.id;
  }

  async enfileirarConsulta(
    notaId: string,
    empresaId: string,
    recibo: string,
  ) {
    return this.consulta.add(
      'consultar',
      {
        notaId,
        empresaId,
        recibo,
      },
      {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 10000,
        },
      },
    );
  }

  async enfileirarDanfe(
    notaId: string,
    empresaId: string,
    chave: string,
  ) {
    return this.danfe.add(
      'gerar',
      {
        notaId,
        empresaId,
        chave,
      },
      {
        attempts: 3,
      },
    );
  }
}