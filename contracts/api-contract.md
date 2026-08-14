# Contrato da API — Backend Fiscal MercadoERP

> Base única de integração entre o Base44 (frontend), o backend Node.js/NestJS e consumers futuros.
> Todas as rotas prefixadas com `/api/v1`. Respostas em `application/json`, salvo endpoints de download (XML/DANFE → `application/xml` / `application/pdf`).

---

## 1. Padrões Gerais

### Autenticação
- **Bearer JWT** no header: `Authorization: Bearer <access_token>`
- Access Token: JWT RS256, expira em **15 min**.
- Refresh Token: JWT opaco, expira em **7 dias**, enviado apenas em `POST /auth/refresh`.
- Rotas marcadas com 🔒 exigem token válido.

### Multi-tenant
- Toda rota 🔒 escopa dados pelo `empresaId` extraído do token (claim `emp`).
- Nenhum endpoint aceita `empresaId` no body exceto onde explicitado (ex.: emissão permite override apenas para admins multi-empresa).

### Convenções de Resposta
```jsonc
// Sucesso (2xx)
{ "data": <payload> }

// Erro (4xx/5xx)
{
  "error": { "code": "VALIDATION_ERROR", "message": "Descrição humana", "details": [ ... ] }
}
```

### Códigos de Erro Padronizados
| code                  | HTTP | Significado                                  |
|-----------------------|------|----------------------------------------------|
| `UNAUTHORIZED`       | 401  | Token ausente/inválido/expirado              |
| `FORBIDDEN`           | 403  | Sem permissão para o recurso                 |
| `NOT_FOUND`           | 404  | Recurso inexistente                         |
| `VALIDATION_ERROR`    | 422  | Payload inválido (detalhes em `details`)    |
| `CERTIFICADO_AUSENTE` | 422  | Empresa sem certificado A1 válido           |
| `SEFAZ_REJEITADA`     | 422  | SEFAZ rejeitou o documento (motivo no body)  |
| `CONFLITO_NUMERACAO`  | 409  | Numeração em uso/concorrência               |
| `RATE_LIMIT`          | 429  | Limite de requisições excedido             |
| `INTERNAL`            | 500  | Erro inesperado                            |

### Paginação (rotas de listagem)
- Query: `?page=1&limit=20&q=&sort=-created_at`
- Resposta: `{ "data": [...], "meta": { "page": 1, "limit": 20, "total": 143 } }`

---

## 2. Status da Nota Fiscal (máquina de estados)

```
RASCUNHO → VALIDADA → XML_GERADO → ASSINADA → FILA_ENVIO → ENVIADA → PROCESSANDO
                                                          ├→ AUTORIZADA (final ok)
                                                          ├→ REJEITADA  (final erro)
                                                          └→ DENEGADA   (final)
AUTORIZADA → CANCELADA (via evento 110111)
RASCUNHO   → INUTILIZADA (quando a faixa é inutilizada)
```

Estados **finais**: `AUTORIZADA`, `REJEITADA`, `CANCELADA`, `DENEGADA`, `INUTILIZADA`.
Estados **transitórios** (fila): `FILA_ENVIO`, `ENVIADA`, `PROCESSANDO`.

---

## 3. Endpoints

### 3.1 Autenticação

#### `POST /auth/login`
🔒❌ — Público.
```jsonc
// Request
{ "email": "dono@mercado.com", "senha": "..." }
// 200
{ "data": { "accessToken": "...", "refreshToken": "...", "expiresIn": 900, "usuario": { "id": "uuid", "nome": "...", "empresaId": "uuid", "role": "dono" } } }
// 401
{ "error": { "code": "UNAUTHORIZED", "message": "Credenciais inválidas" } }
```

#### `POST /auth/refresh`
🔒❌ — Usa refresh token no body.
```jsonc
// Request
{ "refreshToken": "..." }
// 200
{ "data": { "accessToken": "...", "refreshToken": "...", "expiresIn": 900 } }
// 401 → refresh expirado/inválido
```

---

### 3.2 Empresa

#### `GET /empresa` 🔒
```jsonc
// 200
{ "data": {
  "id": "uuid", "cnpj": "00000000000000", "ie": "...", "razaoSocial": "...",
  "crt": "1", "uf": "SP", "ambiente": "homologacao", "regime": "1"
}}
```

#### `PUT /empresa` 🔒 (admin)
```jsonc
// Request (todos opcionais)
{ "razaoSocial": "...", "ie": "...", "uf": "SP", "crt": "1", "ambiente": "producao" }
// 200 → empresa atualizada
// 422 VALIDATION_ERROR → CNPJ/IE inconsistentes
```

---

### 3.3 Certificado Digital A1

#### `POST /certificado/upload` 🔒 (admin) — `multipart/form-data`
```
file:        <.pfx/.p12>
senha:       <string>
alias:       "loja01-a1"   // opcional
```
```jsonc
// 202
{ "data": { "alias": "loja01-a1", "validade": "2027-12-31T23:59:59Z", "status": "valido" } }
// 422 CERTIFICADO_AUSENTE / VALIDATION_ERROR → senha incorreta / arquivo inválido
```
> A senha NÃO é persistida em texto puro; o PFX é criptografado AES-256. A senha fica no Secret Manager.

#### `GET /certificado/status` 🔒
```jsonc
// 200
{ "data": { "configurado": true, "validade": "2027-12-31T23:59:59Z", "valido": true, "diasRestantes": 480 } }
```

---

### 3.4 Clientes

#### `POST /clientes` 🔒
```jsonc
// Request
{ "nome": "...", "cpfCnpj": "...", "telefone": "...", "email": "...", "endereco": { "logradouro": "...", "numero": "...", "bairro": "...", "municipio": "...", "uf": "SP", "cep": "00000000" } }
// 201 → { "data": { "id": "uuid", ... } }
```

#### `GET /clientes` 🔒
```jsonc
// Query: ?q=&page=&limit=
// 200 → { "data": [ { "id", "nome", "cpfCnpj", "telefone", "saldoDevedor": 0 } ], "meta": {...} }
```

#### `PUT /clientes/:id` 🔒
```jsonc
// Request (campos opcionais) → 200 → cliente atualizado
```

---

### 3.5 Produtos

#### `POST /produtos` 🔒
```jsonc
{ "nome": "...", "codigoBarras": "...", "ncm": "00000000", "cest": "...", "cfop": "5102",
  "unidade": "un", "precoCusto": 10, "precoVenda": 20, "estoque": 50,
  "tributacao": { "cst": "00", "csosn": "102", "origem": "0", "aliqIcms": 0, "aliqPis": 0, "aliqCofins": 0 } }
// 201 → { "data": { "id": "uuid", ... } }
```

#### `GET /produtos` 🔒
```jsonc
// Query: ?q=&page=&limit=&estoqueBaixo=true
// 200 → { "data": [ { "id", "nome", "codigoBarras", "precoVenda", "estoque" } ], "meta": {...} }
```

---

### 3.6 NF-e / NFC-e — Emissão

#### `POST /nfe` 🔒
Cria a nota em `RASCUNHO` (valida + numera + gera chave localmente) e opcionalmente enfileira.
```jsonc
// Request
{
  "empresaId": "uuid",         // override só para admins multi-empresa
  "clienteId": "uuid",         // null = consumidor final
  "modelo": "55",              // 55=NF-e, 65=NFC-e
  "serie": "1",
  "itens": [
    { "produtoId": "uuid", "quantidade": 2, "valorUnitario": 50.00, "cfop": "5102" }
  ],
  "pagamento": { "forma": "PIX", "valor": 100.00 },
  "enviar": true               // true → vai para fila SEFAZ; false → só rascunho
}
// 202
{ "data": { "id": 145, "status": "PROCESSANDO", "fila": "enviado", "chave": "3526..." } }
// 422 VALIDATION_ERROR → dados obrigatórios ausentes (detalhes por campo)
// 409 CONFLITO_NUMERACAO → série/numero em uso concorrente
```

#### `GET /nfe` 🔒
```jsonc
// Query: ?status=&dataInicial=&dataFinal=&page=&limit=
// 200 → { "data": [ { "id", "numero", "serie", "modelo", "status", "chave", "valorTotal", "dataEmissao", "clienteNome" } ], "meta": {...} }
```

#### `GET /nfe/:id` 🔒
Detalhe completo (itens, pagamento, eventos, xml/danfe quando autorizada).

#### `POST /nfe/:id/enviar` 🔒
Move `RASCUNHO/VALIDADA` → fila SEFAZ (gera XML, assina, enfileira).
```jsonc
// 202 → { "data": { "id", "status": "FILA_ENVIO" } }
// 422 CERTIFICADO_AUSENTE
```

#### `GET /nfe/:id/status` 🔒
```jsonc
// 200
{ "data": {
  "status": "AUTORIZADA",
  "protocolo": "135260000000000",
  "chave": "352608...",
  "xml": "<NFe>...</NFe>",      // presente só quando AUTORIZADA
  "danfe": "https://...pdf"      // presente só quando AUTORIZADA
}}
```

#### `POST /nfe/:id/cancelar` 🔒 (admin) — evento 110111
```jsonc
// Request
{ "justificativa": "Erro na emissão..." }   // min 15, max 255 chars
// 202 → { "data": { "id", "status": "CANCELADA", "protocolo": "..." } }
// 422 SEFAZ_REJEITADA → { "error": { "code": "SEFAZ_REJEITADA", "message": "...", "details": [{ "codigo": "...", "motivo": "..." }] } }
// 409 → nota não está AUTORIZADA
```

#### `POST /nfe/:id/cce` 🔒 (admin) — carta de correção, evento 110110
```jsonc
// Request
{ "correcoes": [ { "grupo": "xNome", "campo": "dest", "valor": "Novo Nome" } ] }
// 202 → { "data": { "eventoId": "uuid", "sequencia": 1, "protocolo": "..." } }
```

#### `POST /nfe/inutilizar` 🔒 (admin)
```jsonc
// Request
{ "serie": "1", "modelo": "55", "numeroInicial": 100, "numeroFinal": 105, "justificativa": "..." }
// 202 → { "data": { "protocolo": "...", "faixa": "100-105" } }
```

---

### 3.7 Documentos Autorizados

#### `GET /xml/:chave` 🔒
- 200 → `application/xml` (stream)
- 404 → chave não encontrada/não autorizada

#### `GET /danfe/:chave` 🔒
- 200 → `application/pdf` (stream)
- 404 → chave não encontrada/não autorizada
- Header: `Content-Disposition: attachment; filename="DANFE-3526....pdf"`

---

## 4. Webhooks (backend → Base44)

O backend notifica o Base44 sobre mudanças assíncronas (resultado da fila SEFAZ) via webhook:
```
POST {WEBHOOK_BASE44_URL}
Headers: X-Backend-Signature: <HMAC-SHA256 do body>
Body: { "evento": "nfe.autorizada", "nfeId": 145, "status": "AUTORIZADA", "protocolo": "...", "chave": "...", "timestamp": "..." }
```
Eventos: `nfe.autorizada`, `nfe.rejeitada`, `nfe.cancelada`, `nfe.denegada`, `cce.registrada`, `inutilizacao.registrada`.
O Base44 deve validar a assinatura HMAC e ser idempotente (eventos podem chegar duplicados).

---

## 5. Rate Limiting

- Rotas de auth: 5 req/min por IP.
- Rotas de emissão (`POST /nfe*`): 60 req/min por empresa.
- Demais: 300 req/min por empresa.
- Excedido → 429 `{ "error": { "code": "RATE_LIMIT", "message": "...", "details": { "retryAfter": 60 } } }`

---

## 6. Versionamento e CORS

- Prefixo `/api/v1`. Quebras de contrato → `/api/v2`.
- CORS restrito aos domínios do app Base44 (produção + preview).
- HTTPS obrigatório; HSTS habilitado em produção.