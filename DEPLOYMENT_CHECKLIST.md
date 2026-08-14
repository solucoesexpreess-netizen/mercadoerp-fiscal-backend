# ✅ CHECKLIST FINAL: Deployment MercadoERP Fiscal

Use este checklist para garantir que tudo está pronto para produção.

## 📋 Antes do Deploy

### Código & Dependências
- [ ] `npm install` executado sem erros
- [ ] `npm run build` sem erros de compilação
- [ ] TypeScript compila sem avisos (`dist/` criado)
- [ ] Todos os `import` resolvem corretamente
- [ ] Sem `console.log()` em código de produção
- [ ] Variáveis de ambiente usam `process.env.*`

### Segurança
- [ ] `.gitignore` inclui `keys/`, `*.pem`, `.env`
- [ ] Nenhuma chave privada está no repositório
- [ ] Variáveis sensíveis NÃO estão em `.env.example`
- [ ] JWT e certificados configurados como env vars

### Banco de Dados
- [ ] Vercel Postgres ou PostgreSQL em nuvem disponível
- [ ] `DATABASE_URL` formato: `postgresql://user:pass@host:port/db`
- [ ] Conexão testada localmente (`psql $DATABASE_URL`)
- [ ] Migrações SQL revisadas (`database/migrations/0001_init.sql`)
- [ ] Pool de conexões reduzido para serverless (5-10)

### Redis / Filas
- [ ] Upstash ou outro Redis em nuvem criado
- [ ] Credenciais (HOST, PORT, PASSWORD) copiadas
- [ ] TLS ativado (padrão em Upstash)
- [ ] Teste de conexão bem-sucedido

### Configuração do Vercel
- [ ] Vercel Postgres criado e DATABASE_URL copiada
- [ ] `vercel.json` presente no root do projeto
- [ ] Build command em `vercel.json`: `npm run build`
- [ ] Output directory: `dist`
- [ ] Runtime environment: `nodejs20.x` ou similar

### Variáveis de Ambiente Configuradas no Vercel

```
🔐 PRODUÇÃO:
✅ DATABASE_URL = postgresql://...
✅ REDIS_HOST = seu-host.upstash.io
✅ REDIS_PORT = 12345
✅ REDIS_PASSWORD = xxxxxxxxx
✅ REDIS_TLS = true
✅ STORAGE_SECRET_KEY = xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx (32 bytes hex)
✅ NODE_ENV = production
✅ PORT = 3000
✅ CORS_ORIGINS = https://seu-frontend.vercel.app
✅ JWT_ACCESS_TTL = 900
✅ JWT_REFRESH_TTL = 604800
```

## 🚀 Durante o Deploy

### Preparação
- [ ] Fazer push final para GitHub (ou conectar via Vercel)
- [ ] Verificar logs de build no painel Vercel
- [ ] Aguardar build completar (geralmente < 2 min)
- [ ] Verificar se há erros de deployment

### Testes Imediatos
- [ ] Chamar endpoint `/api/v1/health` (deve retornar 200)
- [ ] Verificar logs em Vercel > Deployments > Logs
- [ ] Confirmar que DATABASE_URL está sendo lido
- [ ] Confirmar que REDIS_HOST está conectando

### Migrações
- [ ] Executar migrações SQL:
  ```bash
  psql postgresql://user:pass@host:port/db -f database/migrations/0001_init.sql
  ```
- [ ] Verificar tabelas em Vercel Postgres Dashboard
- [ ] Confirmar que schema foi criado

## ✅ Pós-Deploy

### Testes Funcionais
- [ ] POST /api/v1/auth/login → retorna token
- [ ] GET /api/v1/empresa → retorna dados da empresa (401 se não autenticado)
- [ ] Testar endpoints principais (empresa, cliente, produto, nfe)

### Monitoramento
- [ ] Verificar Vercel Analytics
- [ ] Monitorar erros em Vercel Logs
- [ ] Verificar status do Postgres em Vercel Dashboard
- [ ] Verificar status do Redis em Upstash Console

### Performance
- [ ] Tempo de resposta < 500ms (exceto uploads)
- [ ] Database queries otimizadas (verificar logs)
- [ ] Cache funcionando (se implementado)

## 🔧 Troubleshooting Rápido

| Problema | Solução |
|----------|---------|
| Build falha | Verificar `npm run build` localmente |
| 500 Internal Server Error | Verificar logs em Vercel > Deployments |
| 404 em /api/v1/* | Verificar `vercel.json` routes |
| DATABASE_URL undefined | Confirmar env var em Production Environment |
| CORS error | Adicionar domínio em CORS_ORIGINS |
| Redis connection timeout | Verificar REDIS_* vars e TLS no Upstash |
| Timeout 30s | Otimizar query ou usar Vercel Pro |

## 📊 Recursos Úteis

- **Vercel Dashboard**: https://vercel.com/dashboard
- **Vercel Postgres**: https://vercel.com/storage/postgres
- **Upstash Console**: https://console.upstash.com
- **Logs do Projeto**: Vercel > Project > Deployments > Logs
- **Status da API**: Verificar endpoint `/api/v1/health`

## 💬 Próximos Passos

- [ ] Integrar frontend (Base44) com API
- [ ] Testar fluxo completo de NF-e
- [ ] Configurar SEFAZ com certificados reais
- [ ] Setup de alertas/monitoramento
- [ ] Documentação de API (Swagger/OpenAPI)
- [ ] Testes automatizados (Jest)
- [ ] CI/CD com GitHub Actions

---

**Data do Deploy**: _________________
**Status**: ⏳ Em Progresso / ✅ Concluído
**URL da Produção**: https://_________________
**Contato/Notas**: _______________________________________________

---

**Boa sorte! 🚀**
