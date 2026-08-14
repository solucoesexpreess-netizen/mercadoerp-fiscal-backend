# Backend Fiscal MercadoERP

Backend Node.js/NestJS responsável pela lógica fiscal (NF-e/NFC-e): validação, numeração, geração de chave de acesso, XML, assinatura digital A1, comunicação SEFAZ, filas e geração de DANFE.

O Base44 atua apenas como **frontend**, consumindo esta API.

## Estrutura

```
backend/
  contracts/          # Contrato da API + tipos TS compartilhados (single source of truth)
  database/migrations/ # Migrações SQL versionadas (PostgreSQL)
  src/
    app.module.ts
    main.ts
    config/            # database, redis, env
    common/            # filtros, interceptors, decorators, guards
    auth/              # JWT (login/refresh), strategy, guard
    empresa/           # entidades e CRUD da empresa
    cliente/           # CRUD de clientes (Fase 3 — a implementar)
    produto/           # CRUD de produtos (Fase 3 — a implementar)
    nfe/               # núcleo de emissão local + filas + SEFAZ
    certificado/       # upload/gerência A1 (Fase 5)
    sefaz/             # WebServices SOAP (Fase 4)
    xml/               # montagem XML (Fase 4)
    assinatura/        # xml-crypto + A1 (Fase 5)
    danfe/             # geração PDF (Fase 6)
    jobs/              # BullMQ (Fase 6)
```

## Roadmap de Implementação

- **Fase 1 — Contrato da API** ✅ → `contracts/api-contract.md`, `contracts/types.ts`
- **Fase 2 — Banco de Dados** ✅ → `database/migrations/0001_init.sql`
- **Fase 3 — Backend (NestJS)** ✅ → infra + auth + empresa/cliente/produto + NFe (emissão local) entregues
- **Fase 4 — Comunicação SEFAZ** ✅ estrutura → dispatcher + 6 webservices em arquivos independentes (WSDLs/URLs por UF pendentes)
- **Fase 5 — Certificado A1** ✅ estrutura → upload AES-256-GCM (node-forge) + assinatura XMLDSig (xml-crypto); descriptografia em runtime pendente (Secret Manager)
- **Fase 6 — Filas (BullMQ)** ✅ estrutura → NfeQueue + processor de envio com backoff exponencial; processors de consulta/DANFE/email a completar
- **Fase 7 — Segurança** ✅ → JWT RS256, Argon2, rate-limit (Throttler + Nginx), CORS restrito, Helmet, HSTS
- **Fase 8 — Infraestrutura** ✅ → Dockerfile, docker-compose (Postgres/Redis/Nginx), nginx.conf (TLS + rate limit)

## Setup local

```bash
cp .env.example .env
# Subir Postgres + Redis (docker-compose recomendado)
npm install
npm run migrate
openssl genrsa -out keys/private.pem 2048
openssl rsa -in keys/private.pem -pubout -out keys/public.pem
npm run start:dev
```

## Variáveis de ambiente

- `DATABASE_URL`: conexão PostgreSQL
- `PORT`: porta HTTP do backend
- `NODE_ENV`: environment (development/production)
- `CORS_ORIGINS`: lista separada por vírgula de origens permitidas
- `STORAGE_SECRET_KEY`: chave mestra AES-256-GCM para armazenar `.pfx`
- `JWT_PRIVATE_KEY_PATH`: caminho da chave privada RS256 (opcional)
- `JWT_PUBLIC_KEY_PATH`: caminho da chave pública RS256 (opcional)
- `JWT_ACCESS_TTL`: tempo de expiração do access token em segundos
- `JWT_REFRESH_TTL`: tempo de expiração do refresh token em segundos
- `REDIS_HOST`: host Redis para BullMQ
- `REDIS_PORT`: porta Redis para BullMQ

## Integração com o Base44

O Base44 consome os endpoints sob `/api/v1` (ver `contracts/api-contract.md`).
Resultados assíncronos da fila SEFAZ chegam via webhook (HMAC assinado) para o Base44.