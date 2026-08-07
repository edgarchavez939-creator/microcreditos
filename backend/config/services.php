<?php

return [

    'google_maps' => ['key' => env('GOOGLE_MAPS_API_KEY')],

    /*
     | Ingreso con Google. El Client ID no es secreto (viaja al navegador), pero se
     | define aquí y no con env() directo en el código porque el despliegue ejecuta
     | `config:cache`: a partir de ahí Laravel deja de leer el .env.
     */
    'google' => [
        'client_id' => env('GOOGLE_CLIENT_ID', ''),
    ],

];
