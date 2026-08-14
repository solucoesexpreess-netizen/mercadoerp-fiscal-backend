# Configurações Específicas do Vercel para NestJS

## Opção 1: NestJS Padrão (Recomendado)

O `src/main.ts` original funciona bem no Vercel. Não é necessário fazer nada especial.

```typescript
// src/main.ts - mantém como está
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
}
bootstrap();
```

## Opção 2: Com Suporte a Vercel Serverless (Avançado)

Se quiser otimizar para serverless, use esta configuração:

```typescript
// src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

let app;

export const bootstrap = async () => {
  if (!app) {
    app = await NestFactory.create(AppModule);
    const PORT = process.env.PORT || 3000;
    
    if (process.env.NODE_ENV === 'production') {
      // Vercel
      return app.getHttpAdapter().getInstance();
    } else {
      // Local
      await app.listen(PORT);
    }
  }
  return app;
};

// Execução padrão
bootstrap();
```

## Configuração vercel.json

```json
{
  "version": 2,
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "rewrites": [
    {
      "source": "/api/v1/(.*)",
      "destination": "/dist/main.js"
    }
  ]
}
```

## Ou, use serverless functions:

```json
{
  "version": 2,
  "buildCommand": "npm run build",
  "functions": {
    "src/main.ts": {
      "memory": 1024,
      "maxDuration": 30,
      "runtime": "nodejs20.x"
    }
  }
}
```

## Environment para Vercel

Certifique-se de que `process.env` está sendo lido:

```typescript
// src/config/database.config.ts
export const databaseConfig: TypeOrmModuleOptions = {
  url: process.env.DATABASE_URL, // Vercel injeta automáticamente
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
};
```

## Troubleshooting

### "Cannot find module 'dist/main.js'"
- Verificar que `npm run build` cria `dist/main.js`
- Verificar `outputDirectory` em `vercel.json`

### "Timeout after 30s"
- Operação é muito lenta
- Aumentar `maxDuration` em `vercel.json` (Pro max 300s)
- Otimizar queries do banco

### "Cold start é lento"
- Normal em serverless (até 3-5s na primeira requisição)
- Subsequentes são rápidas (< 100ms)
- Considere Vercel Pro ou outra plataforma se for crítico

---

**Conclusão**: O `src/main.ts` original funciona perfeitamente no Vercel sem modificações.
