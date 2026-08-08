#!/bin/sh
set -e

: "${PORT:=8080}"
sed "s/__PORT__/${PORT}/g" /etc/nginx/http.d/default.conf.template > /etc/nginx/http.d/default.conf

# Migraciones en cada despliegue (idempotentes).
# El error se muestra COMPLETO: antes se silenciaba con un aviso genérico y un
# fallo de migración pasaba inadvertido hasta que algo fallaba mucho después.
if ! php artisan migrate --force; then
  echo "=========================================================="
  echo "  ERROR: las migraciones no se aplicaron correctamente."
  echo "  El servicio arrancará, pero puede faltar estructura de datos."
  echo "  Revisa el detalle del error justo encima de este mensaje."
  echo "=========================================================="
fi

# Datos demo (firstOrCreate -> idempotente, no duplica en reinicios)
php artisan db:seed --force || echo "Aviso: seed no se ejecutó"

# ALTA DEL PRIMER ADMINISTRADOR (sin necesidad de consola).
# El plan gratuito de Render no incluye Shell, así que el alta se dispara con
# variables de entorno. El comando es idempotente: si el usuario ya existe, no
# hace nada, de modo que reiniciar el servicio no causa problemas.
#
#   CREAR_ADMIN_EMAIL     correo del administrador
#   CREAR_ADMIN_NOMBRE    nombre completo
#   CREAR_ADMIN_EMPRESA   id de empresa (por defecto 1)
#   CREAR_ADMIN_GLOBAL    "true" para crear el Administrador Global de KRYPTA
#
# IMPORTANTE: la contraseña generada aparece en el registro del despliegue.
# Cópiala, BORRA estas variables y vuelve a desplegar.
if [ -n "${CREAR_ADMIN_EMAIL}" ] && [ -n "${CREAR_ADMIN_NOMBRE}" ]; then
  echo "=========================================================="
  if [ "${CREAR_ADMIN_GLOBAL}" = "true" ]; then
    php artisan krypta:admin-global --email="${CREAR_ADMIN_EMAIL}" --nombre="${CREAR_ADMIN_NOMBRE}" || true
  else
    php artisan krypta:admin --empresa="${CREAR_ADMIN_EMPRESA:-1}" --email="${CREAR_ADMIN_EMAIL}" --nombre="${CREAR_ADMIN_NOMBRE}" || true
  fi
  echo "  Copia la contraseña, borra las variables CREAR_ADMIN_* y redespliega."
  echo "=========================================================="
fi

# Saneamiento: revertir pagos de transferencias rechazadas antiguas (idempotente)
php artisan transferencias:sanear || echo "Aviso: saneamiento no se ejecutó"
php artisan mora:marcar || echo "Aviso: mora no se sincronizó"

php artisan config:cache || true
php artisan route:cache || true

php-fpm -D
nginx -g 'daemon off;'
