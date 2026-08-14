# 🚀 GUIA RÁPIDO: Deployment MercadoERP Fiscal no Vercel

## ✅ Passo 1: Preparação Local

```bash
# Clone ou abra o projeto
cd mercadoerp-fiscal

# Instale dependências
npm install

# Teste localmente (opcional)
npm run start:dev
```

## ✅ Passo 2: Preparar Vercel Postgres

1. Acesse https://vercel.com
2. Crie uma conta ou faça login
3. Crie um novo projeto
4. Conecte seu repositório GitHub (ou faça push)
5. Vá para **Settings > Storage > Create Database > Postgres**
6. Copie a `DATABASE_URL` fornecida

```
DATABASE_URL=postgresql://...
```

## ✅ Passo 3: Preparar Upstash Redis

1. Acesse https://console.upstash.com (ou crie conta)
2. Crie um novo banco Redis
3. Copie as credenciais:
   - `REDIS_HOST`
   - `REDIS_PORT`
   - `REDIS_PASSWORD`

## ✅ Passo 4: Gerar Chaves de Segurança

Execute localmente para gerar as chaves:

```bash
# Gerar STORAGE_SECRET_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Copie o output (será algo como: a1b2c3d4e5f6...)
```

## ✅ Passo 5: Configurar Variáveis no Vercel

No painel do Vercel, vá para **Settings > Environment Variables** e adicione:

| Variável | Valor | Origem |
|----------|-------|--------|
| `DATABASE_URL` | `postgresql://...` | Vercel Postgres (Passo 2) |
| `REDIS_HOST` | `seu-host.upstash.io` | Upstash (Passo 3) |
| `REDIS_PORT` | `12345` | Upstash (Passo 3) |
| `REDIS_PASSWORD` | `seu-password` | Upstash (Passo 3) |
| `REDIS_TLS` | `true` | Padrão para Upstash |
| `NODE_ENV` | `production` | Padrão |
| `STORAGE_SECRET_KEY` | (resultado do Passo 4) | Gerado localmente |
| `CORS_ORIGINS` | `https://seu-frontend.vercel.app` | Seu frontend |
| `JWT_ACCESS_TTL` | `900` | Padrão (15 min) |
| `JWT_REFRESH_TTL` | `604800` | Padrão (7 dias) |
| `PORT` | `3000` | Padrão |

## ✅ Passo 6: Fazer Deploy

Opção A: via CLI (Recomendado)
```bash
npm install -g vercel
vercel --prod
```

Opção B: via GitHub (Automático)
1. Faça push das mudanças para GitHub
2. Vercel detectará automaticamente e fará deploy

## ✅ Passo 7: Executar Migrações

Após o primeiro deploy:

```bash
# Via psql local (precisa de acesso):
psql $DATABASE_URL -f database/migrations/0001_init.sql

# Ou via Vercel CLI (se tiver permissão):
vercel env pull
PGPASSWORD=$POSTGRES_PASSWORD psql -h $POSTGRES_HOST -U $POSTGRES_USER -d $POSTGRES_DATABASE -f database/migrations/0001_init.sql
```

## ✅ Passo 8: Testar a API

```bash
# Substitua pela URL do seu projeto
curl https://seu-projeto.vercel.app/api/v1/health

# Deve retornar 200 OK
```

---

## 🔧 Troubleshooting

### ❌ "DATABASE_URL not set"
- Verificar se variável está em **Production Environment** no Vercel
- Salve com `Ctrl+S` ou clique em "Save"

### ❌ "Redis connection timeout"
- Verificar REDIS_HOST, REDIS_PORT, REDIS_PASSWORD
- Testar no painel Upstash se o banco está ativo
- Ativar TLS em Upstash (geralmente já vem ativado)

### ❌ "Timeout after 30s"
- Operação é muito lenta
- Considere otimizar queries ou usar fila assíncrona
- Upgrade para Vercel Pro (permite até 300s)

### ❌ "CORS error"
- Verificar se domínio do frontend está em CORS_ORIGINS
- Formato: `https://seu-dominio.com` (sem barra no final)

---

## 📊 Monitoramento

Após deployment:

1. **Logs**: Painel Vercel > Deployments > Logs
2. **Database**: Vercel Postgres Dashboard
3. **Redis**: Upstash Console
4. **Performance**: Vercel Analytics

---

## 💡 Dicas Importantes

- 🔐 **NÃO** commite variáveis sensíveis (chaves, senhas)
- ⏰ BullMQ em serverless pode ser lento. Monit ore filas no Upstash
- 📦 Tamanho do pacote deve ser < 50MB (verificar `npm run build`)
- 🌍 CORS_ORIGINS deve incluir exatamente seu domínio frontend
- 🔄 Auto-deployments funcionam quando você faz push para main/master

---

## 🆘 Suporte

- Documentação Vercel: https://vercel.com/docs
- Upstash Docs: https://upstash.com/docs
- NestJS + Vercel: https://docs.nestjs.com/deployment
- Issues do projeto: GitHub > Issues

---

**Status**: Pronto para deploy! 🚀
