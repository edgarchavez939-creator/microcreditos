<?php

/**
 * Parámetros del SEGUIMIENTO EN VIVO (mapa territorial).
 *
 * Van en un archivo de configuración —y no con env() directo en el código— porque
 * en producción se ejecuta `php artisan config:cache`: a partir de ahí Laravel no
 * lee el .env, y cualquier env() fuera de config/ devolvería siempre el valor por
 * defecto. Definido aquí, la variable de entorno sí se respeta.
 */
return [

    /*
     | Días de historial de ubicaciones que se conservan. El rastreo es un dato
     | operativo del día (dónde está el equipo y qué recorrido lleva hoy), no un
     | histórico contable: acumularlo infla la base y son datos personales de
     | ubicación del empleado que no conviene retener más de lo necesario.
     */
    'dias_retencion' => (int) env('UBICACIONES_DIAS_RETENCION', 7),

    /*
     | Intervalo mínimo entre dos puntos del mismo empleado (segundos).
     | El cliente reporta cada 60 s; este guard protege ante reintentos o
     | varias pestañas abiertas.
     */
    'intervalo_minimo_seg' => (int) env('UBICACIONES_INTERVALO_MIN', 45),

    /*
     | Anti-ruido de reposo: si el empleado no se ha desplazado más de estos
     | metros y no ha pasado la ventana de reposo, el punto no se guarda.
     | Evita cientos de puntos idénticos cuando está detenido (almuerzo, visita).
     */
    'movimiento_minimo_m' => (int) env('UBICACIONES_MOVIMIENTO_MIN_M', 25),
    'ventana_reposo_seg'  => (int) env('UBICACIONES_VENTANA_REPOSO', 300),

    /*
     | Máximo de puntos que se envían al dibujar el recorrido del día. El trazo
     | se ve igual con ~120 y la respuesta pesa una fracción.
     */
    'max_puntos_recorrido' => (int) env('UBICACIONES_MAX_PUNTOS', 120),

];
