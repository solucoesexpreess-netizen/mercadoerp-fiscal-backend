# 🔗 INTEGRAÇÃO BASE44 — GUIA COMPLETO

**Status**: ✅ Pronto para conectar  
**Domínio Base44**: `https://gestorbetao.base44.app`  
**Data**: 14/08/2026

---

## 📋 O QUE FOI CRIADO

Três arquivos novos para conectar Base44 com seu backend:

### 1️⃣ `src/auth/base44.controller.ts`
```
POST /api/v1/base44/auth
├─ Autentica gestorbetao.base44.app
├─ Retorna JWT válido por 1 hora
└─ Usa HMAC com timing-safe compare
```

### 2️⃣ `src/nfe/base44.controller.ts`
```
POST /api/v1/nfe/base44/emitir       ← Emitir NFC-e
POST /api/v1/nfe/base44/{id}/status  ← Verificar status
POST /api/v1/nfe/base44/{id}/cancelar ← Cancelar NFC-e
POST /api/v1/nfe/base44/{id}/cce     ← Emitir Carta Correção
```

### 3️⃣ `src/nfe/services/webhook-dispatcher.service.ts`
```
Eventos que notificam Base44:
├─ nfe.criada      → NFC-e criada localmente
├─ nfe.autorizada  → SEFAZ autorizou
├─ nfe.rejeitada   → SEFAZ rejeitou
├─ nfe.cancelada   → NFC-e cancelada
└─ nfe.error       → Erro genérico
```

---

## 🔧 CONFIGURAÇÃO NECESSÁRIA

### **1. Variáveis de Ambiente (.env.production)**

Adicione estas variáveis:

```env
# === BASE44 INTEGRATION ===

# Credenciais Base44 (você deve fornecer esses valores)
BASE44_API_KEY=seu_api_key_aqui
BASE44_API_SECRET=seu_api_secret_aqui

# URL do webhook em Base44 (exemplo)
BASE44_WEBHOOK_URL=https://gestorbetao.base44.app/api/v1/webhooks/nfe

# Secret para assinar webhooks (deve ser o MESMO em Base44)
WEBHOOK_HMAC_SECRET=seu_webhook_secret_seguro

# URL do seu backend (para Base44 acessar DANFE)
API_URL=https://seu-backend.vercel.app
```

---

## 🚀 FLUXO DE INTEGRAÇÃO

### **Step 1: Base44 Autentica**
```bash
POST https://seu-backend.vercel.app/api/v1/base44/auth

Body:
{
  "apiKey": "seu_api_key_aqui",
  "apiSecret": "seu_api_secret_aqui"
}

Response:
{
  "token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 3600,
  "tipo": "Bearer"
}
```

### **Step 2: Base44 Carrega Certificado**
```bash
POST https://seu-backend.vercel.app/api/v1/certificado/upload

Headers:
Authorization: Bearer <token>

Body (multipart/form-data):
- file: certificado.pfx
- senha: senha_do_certificado
- alias: minha_empresa
- empresaId: uuid-da-empresa

Response:
{
  "alias": "minha_empresa",
  "validade": "2027-06-15T00:00:00Z",
  "status": "valido"
}
```

### **Step 3: Base44 Emite NFC-e**
```bash
POST https://seu-backend.vercel.app/api/v1/nfe/base44/emitir

Headers:
Authorization: Bearer <token>
X-Base44-Pedido-ID: pedido-12345  (opcional, para rastreamento)

Body:
{
  "empresaId": "uuid-empresa",
  "clienteId": null,  // consumidor final
  "modelo": "65",     // NFC-e
  "itens": [
    {
      "produtoId": "uuid",
      "quantidade": 1,
      "valorUnitario": 100.00,
      "descricao": "Produto X"
    }
  ],
  "pagamento": {
    "forma": "PIX",
    "valor": 100.00
  }
}

Response:
{
  "notaId": "uuid-nota",
  "chave": "35240814112345000160650010000000011234567890",
  "modelo": "65",
  "serie": "1",
  "numero": "1",
  "status": "emitida",
  "pedidoExternoId": "pedido-12345",
  "proximaVerificacao": "2026-08-14T10:30:00Z"
}
```

### **Step 4: Webhook Notifica Base44**
```bash
POST https://gestorbetao.base44.app/api/v1/webhooks/nfe

Headers:
Content-Type: application/json
X-Webhook-Event: nfe.autorizada
X-Webhook-Signature: sha256=abcd1234...
X-Webhook-Timestamp: 2026-08-14T10:30:00Z

Body (nfe.autorizada):
{
  "event": "nfe.autorizada",
  "timestamp": "2026-08-14T10:30:00Z",
  "data": {
    "notaId": "uuid-nota",
    "chave": "35240814112345000160650010000000011234567890",
    "protocolo": "135240814112345",
    "statusProtocolo": "100",
    "dataAutorizacao": "2026-08-14T10:30:00Z",
    "danfeUrl": "https://seu-backend.vercel.app/api/v1/nfe/uuid-nota/danfe",
    "xmlUrl": "https://seu-backend.vercel.app/api/v1/nfe/uuid-nota/xml",
    "pedidoExternoId": "pedido-12345"
  }
}
```

---

## ✅ INTEGRAÇÃO PASSO-A-PASSO

### **Dia 1: Setup**

```bash
# 1. Adicione variáveis ao .env.production
BASE44_API_KEY=???
BASE44_API_SECRET=???
BASE44_WEBHOOK_URL=https://gestorbetao.base44.app/api/v1/webhooks/nfe
WEBHOOK_HMAC_SECRET=seu_secret

# 2. Teste autenticação (curl)
curl -X POST https://seu-backend.vercel.app/api/v1/base44/auth \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "seu_api_key",
    "apiSecret": "seu_api_secret"
  }'

# Esperado: { token, expiresIn, tipo }
```

### **Dia 2: Upload Certificado**

```bash
# 1. Base44 carrega certificado A1
curl -X POST https://seu-backend.vercel.app/api/v1/certificado/upload \
  -H "Authorization: Bearer <token>" \
  -F "file=@seu-cert.pfx" \
  -F "senha=sua-senha" \
  -F "alias=gestorbetao" \
  -F "empresaId=uuid"

# Esperado: { alias, validade, status }
```

### **Dia 3: Emitir Teste**

```bash
# 1. Emitir NFC-e teste
curl -X POST https://seu-backend.vercel.app/api/v1/nfe/base44/emitir \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -H "X-Base44-Pedido-ID: test-001" \
  -d '{
    "empresaId": "uuid",
    "clienteId": null,
    "modelo": "65",
    "itens": [{
      "produtoId": "uuid",
      "quantidade": 1,
      "valorUnitario": 10.00,
      "descricao": "Produto teste"
    }],
    "pagamento": {
      "forma": "PIX",
      "valor": 10.00
    }
  }'

# Esperado: { notaId, chave, status }
```

### **Dia 4: Verificar Status**

```bash
# 1. Verificar status da NFC-e
curl -X POST https://seu-backend.vercel.app/api/v1/nfe/base44/{notaId}/status \
  -H "Authorization: Bearer <token>"

# Esperado: 
# - status: "emitida" (enfileirada)
# - status: "autorizada" (aprovada SEFAZ)
# - status: "rejeitada" (erro)
# - erro: { codigoErro, mensagem }
```

---

## 🔐 SEGURANÇA

### **Checklist Segurança**

- [x] HMAC SHA-256 para assinar webhooks
- [x] Timing-safe comparison para credenciais
- [x] JWT com RS256 (assimétrico)
- [x] HTTPS obrigatório em produção
- [x] Credenciais em variáveis de ambiente
- [x] Token com expiração (1 hora)
- [x] Validação de campos obrigatórios

### **Validação de Webhook em Base44**

```javascript
// Em Base44, para validar webhook:
const crypto = require('crypto');

function validarWebhook(request) {
  const signature = request.headers['x-webhook-signature'];
  const payload = JSON.stringify(request.body);
  
  const hmac = crypto.createHmac('sha256', process.env.WEBHOOK_HMAC_SECRET);
  const calculatedSignature = 'sha256=' + hmac.update(payload).digest('hex');
  
  return signature === calculatedSignature;
}
```

---

## 📊 EVENTOS WEBHOOK

### **nfe.criada** (NFC-e foi criada localmente)
```json
{
  "event": "nfe.criada",
  "data": {
    "notaId": "uuid",
    "chave": "52 dígitos",
    "modelo": "65",
    "numero": 1,
    "valor": 100.00,
    "pedidoExternoId": "pedido-12345"
  }
}
```

### **nfe.autorizada** (SEFAZ aprovou)
```json
{
  "event": "nfe.autorizada",
  "data": {
    "notaId": "uuid",
    "chave": "52 dígitos",
    "protocolo": "135240814112345",
    "statusProtocolo": "100",
    "danfeUrl": "https://...",
    "xmlUrl": "https://...",
    "pedidoExternoId": "pedido-12345"
  }
}
```

### **nfe.rejeitada** (SEFAZ recusou)
```json
{
  "event": "nfe.rejeitada",
  "data": {
    "notaId": "uuid",
    "chave": "52 dígitos",
    "codigoErro": "269",
    "mensagemErro": "Aliquota ICMS informada diverge...",
    "pedidoExternoId": "pedido-12345"
  }
}
```

### **nfe.cancelada** (NFC-e foi cancelada)
```json
{
  "event": "nfe.cancelada",
  "data": {
    "notaId": "uuid",
    "chave": "52 dígitos",
    "protocoloCancelamento": "135240814112346",
    "dataCancelamento": "2026-08-14T10:30:00Z",
    "pedidoExternoId": "pedido-12345"
  }
}
```

### **nfe.error** (Erro genérico)
```json
{
  "event": "nfe.error",
  "data": {
    "notaId": "uuid",
    "erro": "Certificado expirado",
    "detalhes": {...},
    "dataErro": "2026-08-14T10:30:00Z"
  }
}
```

---

## 🧪 TESTE COMPLETO (Curl)

```bash
#!/bin/bash

BACKEND="https://seu-backend.vercel.app"
API_KEY="seu_api_key"
API_SECRET="seu_api_secret"

# 1. Autenticar
echo "1️⃣  Autenticando..."
TOKEN=$(curl -s -X POST $BACKEND/api/v1/base44/auth \
  -H "Content-Type: application/json" \
  -d "{\"apiKey\": \"$API_KEY\", \"apiSecret\": \"$API_SECRET\"}" \
  | jq -r '.token')

echo "Token: $TOKEN"

# 2. Emitir NFC-e
echo ""
echo "2️⃣  Emitindo NFC-e..."
RESULTADO=$(curl -s -X POST $BACKEND/api/v1/nfe/base44/emitir \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Base44-Pedido-ID: teste-001" \
  -d '{
    "empresaId": "seu-uuid-empresa",
    "clienteId": null,
    "modelo": "65",
    "itens": [{
      "produtoId": "seu-uuid-produto",
      "quantidade": 1,
      "valorUnitario": 10.00,
      "descricao": "Produto Teste"
    }],
    "pagamento": {
      "forma": "PIX",
      "valor": 10.00
    }
  }')

echo $RESULTADO | jq '.'

# 3. Extrair notaId
NOTA_ID=$(echo $RESULTADO | jq -r '.notaId')
echo ""
echo "3️⃣  Nota criada: $NOTA_ID"

# 4. Verificar status (após 5 segundos)
sleep 5
echo ""
echo "4️⃣  Verificando status..."
curl -s -X POST $BACKEND/api/v1/nfe/base44/$NOTA_ID/status \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.'
```

---

## 🎯 PRÓXIMOS PASSOS

1. **Forneça credenciais Base44**
   - Qual é o `apiKey`?
   - Qual é o `apiSecret`?
   - Qual é a URL exata do webhook?

2. **Configure as variáveis**
   - Adicione ao `.env.production`
   - Deploy para Vercel

3. **Teste com curl**
   - Comece com autenticação
   - Depois certificado
   - Depois emissão

4. **Monitorar webhooks**
   - Verifique logs no Vercel
   - Verifique se Base44 recebe

---

## ❓ FAQ

**P: Como obtenho apiKey e apiSecret?**  
R: Base44 fornece isso quando você configura a integração.

**P: Webhook não está sendo recebido?**  
R: 1. Verifique URL em BASE44_WEBHOOK_URL  
   2. Verifique se WEBHOOK_HMAC_SECRET é igual em ambos  
   3. Verifique logs do Vercel

**P: Token expirou?**  
R: Token válido por 1 hora. Chame `/api/v1/base44/auth` novamente.

**P: Como cancelo uma NFC-e?**  
R: `POST /api/v1/nfe/base44/{notaId}/cancelar` com justificativa

**P: Como emito Carta de Correção?**  
R: `POST /api/v1/nfe/base44/{notaId}/cce` com erro e correção

---

**Status: ✅ PRONTO PARA CONECTAR**

Próximo: Forneça credenciais Base44 para eu registrar no `.env.production`
