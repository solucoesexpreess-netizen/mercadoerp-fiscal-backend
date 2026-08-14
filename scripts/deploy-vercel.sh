#!/bin/bash

# Script de Deploy MercadoERP Fiscal para Vercel
# Antes de executar, certifique-se de:
# 1. Ter a CLI do Vercel instalada: npm install -g vercel
# 2. Estar autenticado: vercel login
# 3. Ter configurado todas as variáveis de ambiente no painel do Vercel

set -e

echo "🚀 Iniciando deployment MercadoERP Fiscal para Vercel..."
echo ""

# Verificar se vercel CLI está instalado
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI não encontrada. Instale com: npm install -g vercel"
    exit 1
fi

echo "✅ Vercel CLI detectada"
echo ""

# Build local
echo "🔨 Compilando projeto..."
npm run build

if [ ! -d "dist" ]; then
    echo "❌ Build falhou. Verif ique erros acima."
    exit 1
fi

echo "✅ Build concluído com sucesso"
echo ""

# Verificar variáveis de ambiente
echo "🔐 Verificando variáveis de ambiente..."
required_vars=(
    "DATABASE_URL"
    "REDIS_HOST"
    "REDIS_PORT"
    "STORAGE_SECRET_KEY"
)

for var in "${required_vars[@]}"; do
    if [ -z "$(vercel env ls --project=mercadoerp-fiscal 2>/dev/null | grep $var)" ]; then
        echo "⚠️  Variável $var pode não estar configurada"
    fi
done

echo ""
echo "📤 Fazendo deploy para Vercel..."
echo ""

# Deploy
vercel --prod --confirm

echo ""
echo "✅ Deploy concluído!"
echo ""
echo "📝 Próximas ações:"
echo "  1. Executar migrações de banco de dados"
echo "  2. Gerar chaves JWT (se necessário)"
echo "  3. Testar endpoints da API"
echo ""
echo "🔗 URL da aplicação será mostrada acima"
