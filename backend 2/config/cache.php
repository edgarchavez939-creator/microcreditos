<?php
return [
    'default' => env('CACHE_STORE', 'database'),
    'stores' => [
        'array' => ['driver' => 'array', 'serialize' => false],
        'database' => [
            'driver' => 'database',
            'table' => 'cache',
            'connection' => null,
            'lock_connection' => null,
        ],
        'file' => ['driver' => 'file', 'path' => storage_path('framework/cache/data')],
        'redis' => ['driver' => 'redis', 'connection' => 'default', 'lock_connection' => 'default'],
    ],
    'prefix' => env('CACHE_PREFIX', 'mc_cache'),
];
