import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { config } from 'dotenv';

config();

export const databaseConfig: TypeOrmModuleOptions = {
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [__dirname + '/../**/*.entity.{ts,js}'],
  migrations: [__dirname + '/../../database/migrations/*.{ts,js}'],
  synchronize: false, // usa migrações SQL versionadas
  logging: process.env.NODE_ENV !== 'production',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  // Configurações para melhorar performance em serverless (Vercel/Upstash)
  poolSize: process.env.NODE_ENV === 'production' ? 5 : 10,
  connectTimeoutMS: 10000,
};
