# 🚀 MercadoERP Fiscal — Guia de Deployment

> Backend NestJS para emissão de Notas Fiscais Eletrônicas (NF-e/NFC-e) com integração SEFAZ.

## 📚 Documentação de Deployment

Este projeto foi preparado para deployment no **Vercel**. Leia os guias abaixo na ordem:

### 1. **[QUICK_START_VERCEL.md](./QUICK_START_VERCEL.md)** ⭐ COMECE POR AQUI
   - Guia passo-a-passo visual
   - Instruções para Vercel Postgres + Upstash Redis
   - Migração de banco de dados

### 2. **[DEPLOYMENT.md](./DEPLOYMENT.md)**
   - Opções de plataformas (Vercel vs Railway)
   - Explicação de limitações serverless
   - Troubleshooting detalhado

### 3. **[DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md)**
   - Checklist antes de fazer deploy
   - Verificação de segurança
   - Testes pós-deployment

### 4. **[VERCEL_CONFIG.md](./VERCEL_CONFIG.md)**
   - Configuração específica de Vercel
   - Alternativas de runtime
   - Dicas de performance

---

## 🎯 TL;DR — Deploy Rápido (5 minutos)

```bash
# 1. Criar conta em Vercel + conectar GitHub
# 2. Vercel > Storage > Create Postgres Database
# 3. Criar Upstash Redis em console.upstash.com
# 4. Adicionar variáveis de ambiente no Vercel:

DATABASE_URL=postgresql://...          # Vercel Postgres
REDIS_HOST=seu-host.upstash.io         # Upstash
REDIS_PORT=12345                       # Upstash
REDIS_PASSWORD=seu-password            # Upstash
REDIS_TLS=true                         # Upstash
STORAGE_SECRET_KEY=xxxxx...xxxxx       # Gerar: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
NODE_ENV=production
CORS_ORIGINS=https://seu-frontend.vercel.app

# 5. Fazer push para GitHub
# 6. Vercel deploy automático
# 7. Executar migrações (após primeiro deploy):
#    psql $DATABASE_URL -f database/migrations/0001_init.sql
```

---

## 📊 Arquitetura da Solução

```
┌─────────────────────────────────────────────┐
│         Frontend (Base44 — Vercel)          │
│         https://base44.vercel.app           │
└─────────────────┬───────────────────────────┘
                  │ HTTPS
┌─────────────────▼───────────────────────────┐
│    MercadoERP Fiscal (NestJS — Vercel)      │
│  https://mercadoerp-fiscal.vercel.app       │
│         /api/v1/...                         │
└─────────────────┬───────────────────────────┘
                  │
        ┌─────────┴─────────┐
        │                   │
┌───────▼────────┐  ┌───────▼─────────┐
│  Vercel        │  │  Upstash        │
│  Postgres      │  │  Redis          │
│  (Database)    │  │  (Filas BullMQ) │
└────────────────┘  └─────────────────┘
        │                   │
        └─────────┬─────────┘
                  │ (TLS)
        ┌─────────▼──────────────────┐
        │  SEFAZ Webservices (Brasil) │
        │  (Comunicação NF-e)         │
        └────────────────────────────┘
```

---

## ✅ Funcionalidades Implementadas

- ✅ **Autenticação JWT RS256**
- ✅ **Multi-tenant (por empresa)**
- ✅ **Gestão de Empresas**
- ✅ **Cadastro de Clientes**
- ✅ **Cadastro de Produtos**
- ✅ **Emissão Local de NF-e** (validação, numeração, chave)
- ✅ **Assinatura Digital A1** (AES-256-GCM)
- ✅ **Validação XSD**
- ✅ **Filas BullMQ** (com Upstash Redis)
- ✅ **Geração de DANFE** (PDF)
- ✅ **Estrutura SEFAZ** (dispatcher, webservices)
- ✅ **Rate Limiting** (Throttler + Nginx)
- ✅ **CORS Restrito**
- ✅ **Security Headers** (Helmet)
- ✅ **Logging Estruturado**

---

## 🔄 Workflow Típico de NF-e

```
1. POST /api/v1/nfe/emitir
   ├─ Valida dados
   ├─ Aloca número (numeração por série/modelo)
   ├─ Gera chave de acesso
   └─ Cria RASCUNHO

2. POST /api/v1/nfe/:id/enviar
   ├─ Move para FILA_ENVIO
   └─ Enfileira em BullMQ

3. [Worker] Processa fila
   ├─ Carrega dados
   ├─ Gera XML
   ├─ Valida contra XSD
   ├─ Assina digitalmente
   ├─ Envia para SEFAZ
   └─ Atualiza status

4. SEFAZ responde
   ├─ Se autorizado → AUTORIZADA + protocolo
   ├─ Se rejeitado → REJEITADA + motivo
   └─ Status na nota atualizado

5. GET /api/v1/nfe/:id/danfe
   └─ Gera PDF (DANFE) para impressão
```

---

## 🔐 Segurança em Produção

- **JWT RS256**: Chaves privadas em Vercel Secrets
- **Certificado A1**: Armazenado criptografado com AES-256-GCM
- **Database**: PostgreSQL com SSL/TLS
- **Redis**: Upstash com TLS obrigatório
- **CORS**: Whitelist restrita
- **Rate Limit**: 300 req/min por IP
- **Helmet**: Headers de segurança (HSTS, CSP, etc.)
- **Argon2**: Hash de senhas (não plaintext)

---

## 📦 Variáveis de Ambiente

| Variável | Tipo | Descrição |
|----------|------|-----------|
| `DATABASE_URL` | string | Conexão PostgreSQL (Vercel Postgres) |
| `REDIS_HOST` | string | Host Redis (Upstash) |
| `REDIS_PORT` | number | Porta Redis |
| `REDIS_PASSWORD` | string | Senha Redis |
| `REDIS_TLS` | bool | Usar TLS (Upstash: `true`) |
| `STORAGE_SECRET_KEY` | string | Chave 32-byte para AES-256-GCM |
| `NODE_ENV` | string | `production` ou `development` |
| `PORT` | number | Porta HTTP (Vercel: 3000) |
| `CORS_ORIGINS` | string | Dominios permitidos (separado por comma) |
| `JWT_ACCESS_TTL` | number | Expiração token (segundos, padrão 900) |
| `JWT_REFRESH_TTL` | number | Expiração refresh (segundos, padrão 604800) |

---

## 🚀 Deploy em Produção

### Via Vercel CLI

```bash
npm install -g vercel
vercel --prod
```

### Via GitHub (Automático)

1. Push para `main`/`master`
2. Vercel detecta e faz deploy automaticamente
3. Verifique logs em Vercel Dashboard

### Pós-Deploy

```bash
# 1. Executar migrações
psql $DATABASE_URL -f database/migrations/0001_init.sql

# 2. Testar health check
curl https://seu-projeto.vercel.app/api/v1/health

# 3. Verificar logs
# Vercel Dashboard > Deployments > Logs
```

---

## 🧪 Testes Locais

```bash
# Setup
npm install
cp .env.example .env
# Configure .env com PostgreSQL local + Redis local

# Docker (recomendado)
docker-compose up -d

# Development
npm run start:dev

# Build
npm run build

# Production
npm run start:prod
```

---

## 📞 Suporte & Recursos

- **NestJS Docs**: https://docs.nestjs.com
- **Vercel Docs**: https://vercel.com/docs
- **Vercel Postgres**: https://vercel.com/storage/postgres
- **Upstash**: https://upstash.com/docs
- **TypeORM**: https://typeorm.io
- **BullMQ**: https://docs.bullmq.io

---

## 🎓 Roadmap Futuro

- [ ] Manifestação de Destinatário (MDe)
- [ ] NFCe (Nota Fiscal do Consumidor)
- [ ] Cancelamento + CC-e (Carta de Correção)
- [ ] Inutilização de Numeração
- [ ] Relatórios Fiscais
- [ ] Dashboard Administrativo
- [ ] Webhooks para eventos (Base44)
- [ ] Backup Automático
- [ ] Analytics & Auditing

---

## 📝 Licença

Propriedade de [Soluções Express Netizen](https://github.com/solucoesexpreess-netizen)

---

**Pronto para fazer deploy? 🚀 Comece com [QUICK_START_VERCEL.md](./QUICK_START_VERCEL.md)**
