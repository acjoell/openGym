#!/bin/sh
set -e

echo "Inicializando esquema Prisma..."
npx prisma db push --skip-generate

echo "Migrando datos iniciales..."
node scripts/migrate.js

echo "Creando datos demo..."
node scripts/seed-demo.js

echo "Iniciando API..."
exec node server.js