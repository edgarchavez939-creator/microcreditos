#!/bin/sh
set -e

: "${PORT:=8080}"
sed "s/__PORT__/${PORT}/g" /etc/nginx/http.d/default.conf.template > /etc/nginx/http.d/default.conf

# Migraciones en cada despliegue (idempotentes)
php artisan migrate --force || echo "Aviso: migrate no se ejecutó (verifica DATABASE_URL)"

# Datos demo (firstOrCreate -> idempotente, no duplica en reinicios)
php artisan db:seed --force || echo "Aviso: seed no se ejecutó"

# Saneamiento: revertir pagos de transferencias rechazadas antiguas (idempotente)
php artisan transferencias:sanear || echo "Aviso: saneamiento no se ejecutó"

php artisan config:cache || true
php artisan route:cache || true

php-fpm -D
nginx -g 'daemon off;'
