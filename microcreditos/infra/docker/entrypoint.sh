#!/bin/sh
set -e
php artisan config:cache || true
php artisan route:cache || true
php-fpm -D
nginx -g 'daemon off;'
