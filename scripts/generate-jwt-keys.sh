#!/bin/bash

# Script para gerar chaves JWT RS256 para produção
# Execute este script e guarde os outputs com segurança

echo "🔐 Gerando chaves JWT RS256 para produção..."
echo ""

# Gerar chave privada
openssl genrsa -out private.pem 2048

echo ""
echo "✅ Chave privada gerada: private.pem"
echo ""

# Gerar chave pública
openssl rsa -in private.pem -pubout -out public.pem

echo "✅ Chave pública gerada: public.pem"
echo ""

# Converter para base64 para usar em variáveis de ambiente
echo ""
echo "🔒 Valores base64 para Vercel Environment Variables:"
echo ""
echo "JWT_PRIVATE_KEY_BASE64:"
cat private.pem | base64
echo ""
echo "JWT_PUBLIC_KEY_BASE64:"
cat public.pem | base64
echo ""

# Gerar STORAGE_SECRET_KEY (32 bytes)
echo ""
echo "🔑 Gerar nova STORAGE_SECRET_KEY (copiar para Vercel):"
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
echo ""

echo "⚠️  IMPORTANTE:"
echo "  1. Guarde private.pem em local seguro (NÃO commite no Git)"
echo "  2. Copie os valores base64 para variáveis de ambiente do Vercel"
echo "  3. Adicione .pem ao .gitignore"
echo ""
echo "💡 Próximo passo: Configurar estas variáveis no painel do Vercel"
