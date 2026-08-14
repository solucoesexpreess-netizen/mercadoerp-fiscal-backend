# 🎯 CHECKLIST DE FINALIZAÇÃO — MercadoERP Fiscal

**Objetivo**: Transformar o projeto de "pronto para testes" em "pronto para produção"

**Tempo estimado**: 2-3 semanas (dependendo da validação SEFAZ)

---

## 📅 FASE 1: Validação SEFAZ (Semana 1)

### ✅ Dia 1-2: Setup e Credenciamento

- [ ] **Certificado A1**
  - [ ] Gerar CSR (Certificate Signing Request) ou obter certificado
  - [ ] Validar que o certificado é tipo **A1** (não A3/Token)
  - [ ] Validar domínio/empresa associada ao certificado
  - [ ] Testar leitura local: `openssl pkcs12 -in cert.pfx -info`

- [ ] **Credenciamento SEFAZ**
  - [ ] Acesso ao portal de homologação SEFAZ
  - [ ] Credenciar certificado no ambiente
  - [ ] Obter URLs dos webservices (por UF)
  - [ ] Anotar UF de testes (SP recomendado)

- [ ] **Verificar Variáveis de Ambiente**
  ```bash
  # Vercel Dashboard > Settings > Environment Variables
  - DATABASE_URL ✅ (Vercel Postgres)
  - REDIS_HOST ✅ (Upstash)
  - REDIS_PORT ✅ (Upstash)
  - REDIS_PASSWORD ✅ (Upstash)
  - REDIS_TLS=true ✅
  - STORAGE_SECRET_KEY ✅
  - CORS_ORIGINS ✅ (incluir domínio Base44)
  - NODE_ENV=production ✅
  ```

### ✅ Dia 3-4: Teste E2E (Fluxo Completo)

Executar este script para testar todo o fluxo:

```bash
#!/bin/bash

API_URL="https://seu-projeto.vercel.app/api/v1"
EMAIL="test@empresa.com"
SENHA="senha123"

echo "1️⃣ LOGIN"
AUTH=$(curl -s -X POST $API_URL/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"senha\":\"$SENHA\"}")
TOKEN=$(echo $AUTH | jq -r '.data.accessToken')
echo "Token: $TOKEN"

echo ""
echo "2️⃣ UPLOAD CERTIFICADO"
curl -X POST $API_URL/certificado/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/path/to/certificado.pfx" \
  -F "senha=sua-senha" | jq

echo ""
echo "3️⃣ VERIFICAR STATUS CERTIFICADO"
curl -X GET $API_URL/certificado/status \
  -H "Authorization: Bearer $TOKEN" | jq

echo ""
echo "4️⃣ CRIAR NFC-e EM RASCUNHO"
NFC=$(curl -s -X POST $API_URL/nfe \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "clienteId": null,
    "modelo": "65",
    "serie": "1",
    "itens": [
      {
        "produtoId": "UUID-PRODUTO",
        "quantidade": 1,
        "valorUnitario": 100,
        "cfop": "5102"
      }
    ],
    "pagamento": {"forma": "PIX", "valor": 100},
    "enviar": false
  }')
NFC_ID=$(echo $NFC | jq -r '.data.id')
echo "NFC-e ID: $NFC_ID"

echo ""
echo "5️⃣ VISUALIZAR NFC-e"
curl -X GET $API_URL/nfe/$NFC_ID \
  -H "Authorization: Bearer $TOKEN" | jq

echo ""
echo "6️⃣ ENVIAR PARA SEFAZ (FILA)"
curl -X POST $API_URL/nfe/$NFC_ID/enviar \
  -H "Authorization: Bearer $TOKEN" | jq

echo ""
echo "7️⃣ MONITORAR STATUS (AGUARDAR AUTORIZAÇÃO)"
sleep 5
curl -X GET $API_URL/nfe/$NFC_ID/status \
  -H "Authorization: Bearer $TOKEN" | jq
```

**Esperado:**
- ✅ Login retorna `accessToken`
- ✅ Upload certificado retorna `status: "valido"`
- ✅ NFC-e criada em `RASCUNHO`
- ✅ Envio muda status para `FILA_ENVIO`
- ✅ Após 5-30s, status muda para `AUTORIZADA` com protocolo

### ✅ Dia 5: Testes de Erro e Edge Cases

**Cenários a testar:**

```bash
# 1. Certificado expirado/inválido
POST /api/v1/certificado/upload
  # Resposta esperada: 422 CERTIFICADO_INVALIDO

# 2. Emissão com dados incompletos
POST /api/v1/nfe
  # Sem itens: 422 VALIDATION_ERROR

# 3. Cancelamento (se autorizada)
POST /api/v1/nfe/$NFC_ID/cancelar
  { "justificativa": "Erro na emissão..." }
  # Resposta esperada: 202 CANCELADA com protocolo

# 4. Taxa de requisições (rate limit)
for i in {1..301}; do
  curl $API_URL/nfe -H "Authorization: Bearer $TOKEN"
done
# Resposta esperada: 429 RATE_LIMIT após 300

# 5. Token expirado
sleep 900  # 15 min
curl $API_URL/nfe -H "Authorization: Bearer $TOKEN"
# Resposta esperada: 401 UNAUTHORIZED
```

---

## 🔌 FASE 2: Implementar Webhooks (Semana 1-2)

### Step 1: Criar Estrutura de Webhook

```bash
# Já existe em src/common/webhooks/
# Verificar se precisa completar:

ls -la src/common/webhooks/
# webhook.service.ts
# webhook.dispatcher.ts
# webhook.signature.ts
```

### Step 2: Registrar Callbacks na Emissão

**Arquivo**: `src/nfe/services/emissao-pipeline.service.ts`

Adicionar após autorização:

```typescript
// Após nota ir para AUTORIZADA
await this.webhookDispatcher.dispatch('nfe.autorizada', {
  id: nota.id,
  chave: nota.chave,
  protocolo: protocolo,
  dataAutorizacao: new Date().toISOString(),
  danfeUrl: danfeUri
});

// Se rejeitado
await this.webhookDispatcher.dispatch('nfe.rejeitada', {
  id: nota.id,
  chave: nota.chave,
  motivo: retornoSefaz.xMotivo
});
```

### Step 3: Configurar Webhook no Base44

```bash
# Base44 faz:
POST /api/v1/webhooks
{
  "url": "https://base44.vercel.app/api/v1/nfe/webhook",
  "eventos": ["nfe.autorizada", "nfe.rejeitada"],
  "secret": "seu-secret-hmac"
}

# MercadoERP envia quando evento ocorre:
POST https://base44.vercel.app/api/v1/nfe/webhook
  Headers:
    X-Signature: sha256=...
    X-Event: nfe.autorizada
  Body:
    { "id": "uuid", "chave": "...", "protocolo": "...", ... }
```

### Step 4: Testar

```bash
# Registrar webhook test (https://webhook.site/)
POST /api/v1/webhooks
  { "url": "https://webhook.site/unique-id" }

# Emitir NFC-e
POST /api/v1/nfe (enviar: true)

# Verificar em webhook.site se recebeu evento
```

---

## ⚙️ FASE 3: Implementar Processadores de Fila (Semana 2)

### Step 1: Criar `danfe.processor.ts`

```bash
# Criar arquivo
touch src/jobs/processors/danfe.processor.ts
```

```typescript
// src/jobs/processors/danfe.processor.ts
import { Processor, Process } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Nota } from '../../nfe/entities/nota.entity';
import { DanfeService } from '../../nfe/services/danfe.service';
import { StorageService } from '../../storage/storage.service';

@Processor('nfe.danfe')
export class DanfeProcessor {
  constructor(
    @InjectRepository(Nota) private readonly notas: Repository<Nota>,
    private readonly danfeService: DanfeService,
    private readonly storage: StorageService,
  ) {}

  @Process('gerar')
  async processar(job: Job<{ notaId: string; empresaId: string; chave: string }>) {
    const { notaId, empresaId, chave } = job.data;
    
    // Carregar nota + dados completos
    const nota = await this.notas.findOne({ where: { id: notaId, empresaId } });
    if (!nota || nota.status !== 'AUTORIZADA') throw new Error('Nota não autorizada');

    // Gerar PDF
    const dados = this.construirDanfeDados(nota);
    const pdfBuffer = await this.danfeService.gerarPdf(dados);

    // Salvar em storage
    const danfeUrl = await this.storage.salvarDanfe(chave, pdfBuffer);

    // Atualizar nota
    await this.notas.update(notaId, { danfeUri: danfeUrl });

    return { success: true, danfeUrl };
  }

  private construirDanfeDados(nota: Nota) {
    // Implementar conforme DanfeDados interface
    return { /* ... */ };
  }
}
```

Registrar em `jobs.module.ts`:
```typescript
@Module({
  imports: [BullModule.registerQueue({ name: 'nfe.danfe' })],
  providers: [DanfeProcessor],
})
export class JobsModule {}
```

### Step 2: Criar `consulta.processor.ts`

Para UFs com processamento assíncrono:

```typescript
@Processor('nfe.consulta')
export class ConsultaProcessor {
  @Process('consultar')
  async processar(job: Job<{ notaId, recibo }>) {
    // Chamar consultarRecibo()
    // Atualizar status da nota
    // Disparar webhook se autorizada
  }
}
```

### Step 3: Testar Filas

```bash
# Usar Upstash Dashboard ou Redis CLI
REDIS_HOST="seu-host.upstash.io"
redis-cli -h $REDIS_HOST --aclauth default:$REDIS_PASSWORD

# Verificar filas
> KEYS bull:*
> LLEN bull:nfe.danfe:active

# Enviar NFC-e e monitorar fila
# A nota deve passar de FILA_ENVIO → AUTORIZADA
```

---

## 💾 FASE 4: Implementar Storage S3/R2 (Semana 2)

### Option A: Cloudflare R2 (Recomendado)

```bash
# 1. Criar conta Cloudflare R2
# 2. Criar bucket "mercadoerp-fiscal"
# 3. Gerar token API (Account ID + API Token)

# 4. Instalar SDK
npm install @aws-sdk/client-s3

# 5. Criar service
touch src/storage/storage.service.ts
```

```typescript
// src/storage/storage.service.ts
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class StorageService {
  private s3: S3Client;

  constructor(private config: ConfigService) {
    this.s3 = new S3Client({
      region: 'auto',
      credentials: {
        accessKeyId: config.get('R2_ACCESS_KEY'),
        secretAccessKey: config.get('R2_SECRET_KEY'),
      },
      endpoint: `https://${config.get('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
    });
  }

  async salvarXml(chave: string, xml: string): Promise<string> {
    const key = `xml/${chave}.xml`;
    await this.s3.send(new PutObjectCommand({
      Bucket: 'mercadoerp-fiscal',
      Key: key,
      Body: xml,
      ContentType: 'application/xml',
    }));

    return await this.obterUrl(key, 60); // 1 hora
  }

  async salvarDanfe(chave: string, pdf: Buffer): Promise<string> {
    const key = `danfe/${chave}.pdf`;
    await this.s3.send(new PutObjectCommand({
      Bucket: 'mercadoerp-fiscal',
      Key: key,
      Body: pdf,
      ContentType: 'application/pdf',
    }));

    return await this.obterUrl(key, 1440); // 24 horas
  }

  private async obterUrl(key: string, expiracaoMin: number): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: 'mercadoerp-fiscal',
      Key: key,
    });
    return getSignedUrl(this.s3, command, { expiresIn: expiracaoMin * 60 });
  }
}
```

### Step 2: Integrar em `emissao-pipeline.service.ts`

```typescript
// Após gerar DANFE
const danfeUrl = await this.storage.salvarDanfe(nota.chave, pdfBuffer);
nota.danfeUri = danfeUrl;
await this.notas.save(nota);
```

---

## 🧪 FASE 5: Testes Automatizados (Semana 3)

### Setup Jest

```bash
npm install --save-dev @nestjs/testing jest @types/jest ts-jest
```

Criar `jest.config.js`:
```javascript
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
};
```

### Exemplo: Unit Test para `ChaveAcessoService`

```typescript
// src/nfe/services/chave-acesso.service.spec.ts
describe('ChaveAcessoService', () => {
  let service: ChaveAcessoService;

  beforeEach(() => {
    service = new ChaveAcessoService();
  });

  it('deve gerar chave com 44 dígitos', () => {
    const chave = service.gerar({
      uf: 'SP',
      dataEmissao: new Date('2026-08-12'),
      cnpj: '00000000000000',
      modelo: '65',
      serie: '1',
      numero: 1,
      tpEmis: '1',
    });

    expect(chave).toHaveLength(44);
    expect(/^\d+$/.test(chave)).toBe(true);
  });

  it('deve validar DV corretamente', () => {
    const chave = service.gerar(/* ... */);
    const [dv] = chave.slice(-1);
    expect(validarDV(chave.slice(0, 43), dv)).toBe(true);
  });
});
```

### Exemplo: E2E Test

```typescript
// src/nfe/__tests__/nfe.e2e.spec.ts
describe('NFC-e Emissão (E2E)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    await app.init();

    // Login
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'test@test.com', senha: 'senha' });

    token = res.body.data.accessToken;
  });

  it('fluxo completo: emissão, envio, autorização', async () => {
    // 1. Criar NFC-e
    const nfc = await request(app.getHttpServer())
      .post('/api/v1/nfe')
      .set('Authorization', `Bearer ${token}`)
      .send(/* ... */);

    expect(nfc.status).toBe(202);
    const nfcId = nfc.body.data.id;

    // 2. Enviar para SEFAZ
    await request(app.getHttpServer())
      .post(`/api/v1/nfe/${nfcId}/enviar`)
      .set('Authorization', `Bearer ${token}`);

    // 3. Aguardar autorização
    await new Promise(r => setTimeout(r, 5000));

    // 4. Verificar status
    const status = await request(app.getHttpServer())
      .get(`/api/v1/nfe/${nfcId}/status`)
      .set('Authorization', `Bearer ${token}`);

    expect(status.body.data.status).toBe('AUTORIZADA');
    expect(status.body.data.protocolo).toBeDefined();
  });
});
```

Executar:
```bash
npm test
npm run test:e2e
```

---

## 📚 FASE 6: Documentação e Swagger (Semana 3)

### Adicionar Swagger

```bash
npm install @nestjs/swagger swagger-ui-express
```

Atualizar `main.ts`:
```typescript
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  const config = new DocumentBuilder()
    .setTitle('MercadoERP Fiscal API')
    .setDescription('Backend para emissão de NF-e/NFC-e')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/v1/docs', app, document);

  await app.listen(3000);
}

bootstrap();
```

Adicionar decoradores nos controllers:

```typescript
@ApiOperation({ summary: 'Emitir NFC-e' })
@ApiResponse({ status: 202, description: 'Nota criada' })
@Post()
emitir(@Body() dto: NfeEmissaoDto) { ... }
```

Verificar em: `https://seu-projeto.vercel.app/api/v1/docs`

---

## 🚀 FASE 7: CI/CD com GitHub Actions (Semana 3)

Criar `.github/workflows/ci.yml`:

```yaml
name: CI/CD

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  build:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

      redis:
        image: redis:7
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3

      - uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci

      - run: npm run lint

      - run: npm run build

      - run: npm test

      - run: npm run test:e2e

      - name: Deploy to Vercel (main only)
        if: github.ref == 'refs/heads/main'
        run: npm i -g vercel && vercel --prod --token ${{ secrets.VERCEL_TOKEN }}
```

---

## ✅ FINAL CHECKLIST

### Antes de Ir para Produção:

- [ ] **Testes SEFAZ completos**
  - [ ] NFC-e autorizada
  - [ ] Cancelamento funcionando
  - [ ] CC-e funcionando
  - [ ] Respostas de erro tratadas

- [ ] **Segurança validada**
  - [ ] Certificado não vaza (criptografia ok)
  - [ ] JWT não exposto em logs
  - [ ] Rate limit efetivo
  - [ ] CORS correto

- [ ] **Performance**
  - [ ] Tempo de emissão < 2s
  - [ ] Database queries otimizadas
  - [ ] Redis funcionando sem timeout

- [ ] **Backup & Recovery**
  - [ ] Backup automático de BD
  - [ ] Plano de recuperação de falhas
  - [ ] Logs centralizados (Sentry/DataDog)

- [ ] **Documentação**
  - [ ] README completo
  - [ ] Swagger/OpenAPI online
  - [ ] Troubleshooting guide
  - [ ] Glossário fiscal

- [ ] **Testes**
  - [ ] Unit tests > 80% coverage
  - [ ] E2E tests passando
  - [ ] CI/CD funcionando

---

## 🎯 Próximos Passos (Agora)

```bash
# 1. Validar com SEFAZ
curl -X POST https://<seu-projeto>.vercel.app/api/v1/nfe \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{...}'

# 2. Acompanhar logs
# Vercel Dashboard > Deployments > Logs

# 3. Testar webhook
# webhook.site ou similar

# 4. Criar issues no GitHub com tarefas de cada fase
# gh issue create --title "Phase 2: Webhooks" --body "..."

# 5. Documentar blockers/erros
# Compartilhar com equipe
```

**Tempo total estimado: 2-3 semanas** ⏰

**Crítico**: Validar com certificado real ASAP para resolver issues de SEFAZ cedo.
