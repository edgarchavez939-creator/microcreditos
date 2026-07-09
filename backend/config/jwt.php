<?php
return [
    'secret' => env('JWT_SECRET'),
    'ttl' => (int) env('JWT_TTL', 15),               // minutos (access)
    'refresh_ttl' => (int) env('JWT_REFRESH_TTL', 20160), // minutos (refresh, 14d)
    'algo' => 'HS256',
    'required_claims' => ['iss','iat','exp','nbf','sub','jti'],
    'blacklist_enabled' => true,
    'blacklist_grace_period' => 30,
];
