<?php
return [
    'name' => env('APP_NAME', 'Microcreditos'),
    'credito_delete_key' => env('CREDITO_DELETE_KEY', 'ELIMINAR-2025'),
    'env' => env('APP_ENV', 'production'),
    'debug' => (bool) env('APP_DEBUG', false),
    'url' => env('APP_URL', 'http://localhost'),
    'timezone' => env('APP_TIMEZONE', 'America/Bogota'),
    'locale' => 'es',
    'fallback_locale' => 'en',
    'faker_locale' => 'es_CO',
    'cipher' => 'AES-256-CBC',
    'key' => env('APP_KEY'),
    'maintenance' => ['driver' => 'file'],
];
