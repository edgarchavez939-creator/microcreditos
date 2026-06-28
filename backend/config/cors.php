<?php
return [
    'paths' => ['api/*'],
    'allowed_methods' => ['*'],
    // Orígenes del frontend (Vercel). Configurable por env para no hardcodear.
    'allowed_origins' => array_filter(explode(',', env('CORS_ALLOWED_ORIGINS', ''))),
    'allowed_origins_patterns' => ['#^https://.*\.vercel\.app$#'],
    'allowed_headers' => ['*'],
    'exposed_headers' => [],
    'max_age' => 3600,
    'supports_credentials' => false,
];
