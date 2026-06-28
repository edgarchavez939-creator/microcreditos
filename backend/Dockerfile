# ---------- Backend Laravel 12 para Render (PHP-FPM + Nginx) ----------
FROM php:8.3-fpm-alpine

# Extensiones PHP necesarias (PostgreSQL, etc.)
RUN apk add --no-cache nginx postgresql-dev libpng-dev libzip-dev oniguruma-dev gettext \
 && docker-php-ext-install pdo pdo_pgsql bcmath gd zip opcache

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www

# Dependencias (capa cacheable)
COPY composer.json composer.lock* ./
RUN composer install --no-dev --no-scripts --no-autoloader --no-interaction --prefer-dist

# Código
COPY . .
# Crear directorios escribibles ANTES de dump-autoload (package:discover los necesita)
RUN mkdir -p storage/framework/cache/data storage/framework/sessions storage/framework/views storage/logs bootstrap/cache \
 && composer dump-autoload --optimize --no-dev \
 && chown -R www-data:www-data storage bootstrap/cache \
 && chmod -R 775 storage bootstrap/cache

COPY docker/nginx.conf /etc/nginx/http.d/default.conf.template
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Render inyecta $PORT; el entrypoint lo aplica a Nginx
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["/entrypoint.sh"]
