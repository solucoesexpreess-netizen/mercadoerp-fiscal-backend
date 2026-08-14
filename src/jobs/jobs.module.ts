import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NfeQueue } from './nfe.queue';
import { EnviarProcessor } from './processors/enviar.processor';
import { FiscalCoreModule } from '../nfe/fiscal-core.module';

@Module({
  imports: [
    BullModule.forRootAsync({
      useFactory: () => ({
        connection: {
          host: process.env.REDIS_HOST || 'localhost',
          port: Number(process.env.REDIS_PORT || 6379),
        },
      }),
    }),
    FiscalCoreModule,
  ],
  providers: [NfeQueue, EnviarProcessor],
  exports: [NfeQueue],
})
export class JobsModule {}