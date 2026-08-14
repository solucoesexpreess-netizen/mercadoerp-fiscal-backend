# Guia de Deployment MercadoERP Fiscal no Vercel

## ⚠️ IMPORTANTE: Considerações Arquiteturais

O MercadoERP Fiscal usa **BullMQ + Redis** para processamento assíncrono de filas (emissão NF-e, comunicação SEFAZ, etc.). O Vercel é uma plataforma **serverless**, o que significa:

- ✅ Excelente para APIs síncronas (HTTP requests)
- ❌ Limitado para processos de longa duração (workers, background jobs)
- ❌ Sem suporte nativo a processos persistentes

### Opções de Deployment:

#### Opção 1: Vercel + Upstash (Recomendado para começar)
- Use Vercel para a API
- Use Upstash (Redis Serverless) para BullMQ
- Funciona, mas pode ter limitações em alta concorrência
- **Custo**: Moderado

#### Opção 2: Railway ou Render (Melhor arquitetura)
- Plataforma que suporta processos de longa duração
- Melhor para aplicações que precisam de workers sempre ativos
- Integração simples com PostgreSQL e Redis
- **Custo**: Similar ao Vercel

#### Opção 3: Vercel + AWS (Lambda + SQS)
- Use Vercel para a API
- Use AWS Lambda para workers
- Mais complexo, mas mais escalável
- **Custo**: Pode ser mais caro

---

## 🚀 Passo a Passo: Vercel + Upstash

### 1. Preparar Vercel Postgres

```bash
# No painel do Vercel, crie um projeto novo
# Conecte ao repositório GitHub
# Vá para Settings > Storage > Create Database > Postgres
```

Após criar, copie a `DATABASE_URL` fornecida.

### 2. Preparar Upstash Redis

```bash
# Acesse https://upstash.com
# Crie um conta gratuita
# Crie um banco Redis novo
# Copie as variáveis: REDIS_HOST, REDIS_PORT, REDIS_PASSWORD
```

### 3. Configurar Variáveis de Ambiente no Vercel

No painel do Vercel, acesse **Settings > Environment Variables** e adicione:

```
DATABASE_URL=postgresql://user:password@host/dbname
REDIS_HOST=your-upstash-host
REDIS_PORT=your-upstash-port
REDIS_PASSWORD=your-upstash-password
STORAGE_SECRET_KEY=<gerar com: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
NODE_ENV=production
CORS_ORIGINS=https://your-frontend.vercel.app,https://yourdomain.com
JWT_ACCESS_TTL=900
JWT_REFRESH_TTL=604800
```

### 4. Gerar Chaves JWT RS256 para Produção

```bash
# Execute localmente e guarde com segurança
openssl genrsa -out keys/private.pem 2048
openssl rsa -in keys/private.pem -pubout -out keys/public.pem

# Para usar no Vercel, converta para base64:
# Não é recomendado usar arquivos no Vercel. Considere usar chaves simétricas ou Secret Manager
```

### 5. Executar Migrações de Banco de Dados

Antes de fazer o primeiro deploy, execute manualmente a migração:

```bash
# Localmente:
psql $DATABASE_URL -f database/migrations/0001_init.sql

# Ou via CLI Vercel:
vercel env pull .env.local
PGPASSWORD=$POSTGRES_PASSWORD psql -h $POSTGRES_HOST -U $POSTGRES_USER -d $POSTGRES_DATABASE -f database/migrations/0001_init.sql
```

### 6. Deploy no Vercel

```bash
# Instale a CLI do Vercel
npm install -g vercel

# Deploy
vercel

# Ou, conectando o repositório GitHub:
# 1. Faça push para GitHub
# 2. No painel do Vercel, conecte o repositório
# 3. Configure as variáveis de ambiente
# 4. Vercel fará o deploy automaticamente
```

### 7. Verificar Health da API

```bash
curl https://seu-projeto.vercel.app/api/v1/health
```

---

## ⚡ Limitações Conhecidas

1. **Timeout de 30s**: Operações que demoram mais serão interrompidas
2. **BullMQ**: Workers podem não executar de forma confiável (recomenda-se Upstash com retry)
3. **JWT RS256**: Recomenda-se usar chaves simétricas (HS256) ou Secret Manager
4. **Cold starts**: Primeira requisição pode ser lenta

---

## 🔧 Alternativa Recomendada: Railway

Se você quer evitar complexidades de serverless:

```bash
# 1. Crie conta em https://railway.app
# 2. Conecte seu repositório GitHub
# 3. Railway cria PostgreSQL + Redis automaticamente
# 4. Configure variáveis de ambiente
# 5. Deploy com um clique

# Custará mais ou menos o mesmo que Vercel + Upstash
# Mas será MUITO mais simples e confiável para essa aplicação
```

---

## 📋 Checklist antes do Deploy

- [ ] Todas as variáveis de ambiente configuradas no Vercel
- [ ] Banco de dados criado e migrações executadas
- [ ] Redis (Upstash) funcionando
- [ ] JWT configurado (use HS256 se possível)
- [ ] CORS_ORIGINS correto no .env.production
- [ ] Certificado A1 será armazenado via STORAGE_SECRET_KEY (AES-256-GCM)
- [ ] Testes locais passando
- [ ] CI/CD GitHub Actions configurado (opcional mas recomendado)

---

## 🆘 Troubleshooting

### "DATABASE_URL not set"
→ Verifique se a variável está configurada em Production Environment no Vercel

### "Redis connection failed"
→ Verifique REDIS_HOST, REDIS_PORT, REDIS_PASSWORD
→ Pode ser necessário ativar TLS em Upstash

### "Timeout after 30s"
→ Operação é muito lenta. Considere usar fila assíncrona ou otimizar
→ Aumente maxDuration em vercel.json (até 300s em Pro)

### "CORS error from frontend"
→ Verifique CORS_ORIGINS no .env
→ Inclua exatamente o domínio do frontend

---

## 📚 Documentação Útil

- Vercel Postgres: https://vercel.com/docs/storage/vercel-postgres
- Upstash Redis: https://upstash.com/docs
- NestJS on Vercel: https://docs.nestjs.com/deployment
- Railway.app: https://docs.railway.app/

---

**Próximo passo**: Escolha a plataforma (Vercel ou Railway) e comece a configurar as variáveis de ambiente.
