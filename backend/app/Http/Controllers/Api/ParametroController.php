<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Parametro;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class ParametroController extends Controller
{
    /** Catálogo de parámetros editables: clave => [etiqueta, tipo, descripción, default]. */
    private const CATALOGO = [
        'seguro.porcentaje_min' => [
            'etiqueta' => 'Seguro mínimo (%)', 'tipo' => 'porcentaje',
            'descripcion' => 'Porcentaje mínimo de seguro permitido al crear un crédito.',
            'default' => 0.05,
        ],
        'seguro.porcentaje_max' => [
            'etiqueta' => 'Seguro máximo (%)', 'tipo' => 'porcentaje',
            'descripcion' => 'Porcentaje máximo de seguro permitido al crear un crédito.',
            'default' => 0.10,
        ],
        'cupo.reduccion_por_renovacion' => [
            'etiqueta' => 'Reducción de cupo por reamortización ($)', 'tipo' => 'dinero',
            'descripcion' => 'Valor que se descuenta del cupo del cliente cada vez que reamortiza.',
            'default' => 100000,
        ],
        'scoring.umbral_excelente' => [
            'etiqueta' => 'Scoring: umbral nivel excelente', 'tipo' => 'numero',
            'descripcion' => 'Puntaje (0-100) desde el cual la renovación se recomienda con aumento de cupo.',
            'default' => 80,
        ],
        'scoring.umbral_bueno' => [
            'etiqueta' => 'Scoring: umbral nivel bueno', 'tipo' => 'numero',
            'descripcion' => 'Puntaje desde el cual se recomienda renovar por el mismo monto.',
            'default' => 60,
        ],
        'scoring.umbral_regular' => [
            'etiqueta' => 'Scoring: umbral nivel regular', 'tipo' => 'numero',
            'descripcion' => 'Puntaje desde el cual se recomienda renovar con cupo reducido. Por debajo, no renovar.',
            'default' => 40,
        ],
        'scoring.aumento_cupo' => [
            'etiqueta' => 'Scoring: aumento de cupo nivel excelente (%)', 'tipo' => 'porcentaje',
            'descripcion' => 'Porcentaje de aumento del cupo sugerido para clientes con scoring excelente (0.30 = 30%).',
            'default' => 0.30,
        ],
        'aprobacion.max_supervisor' => [
            'etiqueta' => 'Monto máximo aprobable por supervisor ($)', 'tipo' => 'dinero',
            'descripcion' => 'Si el crédito supera este monto, el supervisor no puede aprobarlo y debe hacerlo un administrador.',
            'default' => 2000000,
        ],
        'aprobacion.max_administrador' => [
            'etiqueta' => 'Monto máximo aprobable por administrador ($)', 'tipo' => 'dinero',
            'descripcion' => 'Tope absoluto de aprobación de créditos en el sistema.',
            'default' => 50000000,
        ],
        'otp.vigencia_minutos' => [
            'etiqueta' => 'Vigencia del código de seguridad (minutos)', 'tipo' => 'entero',
            'descripcion' => 'Tiempo de validez de los códigos OTP para anular pagos o eliminar créditos.',
            'default' => 5,
        ],
        'auth.max_intentos' => [
            'etiqueta' => 'Intentos de acceso fallidos permitidos', 'tipo' => 'entero',
            'descripcion' => 'Número de intentos de inicio de sesión antes de bloquear la cuenta.',
            'default' => 5,
        ],
        'auth.bloqueo_minutos' => [
            'etiqueta' => 'Minutos de bloqueo de cuenta', 'tipo' => 'entero',
            'descripcion' => 'Tiempo de bloqueo tras superar los intentos fallidos.',
            'default' => 15,
        ],
    ];

    private function soloAdmin(Request $request): void
    {
        abort_unless($request->user()->esAdministrador(), 403, 'Solo el administrador puede gestionar parámetros.');
    }

    public function index(Request $request)
    {
        $this->soloAdmin($request);

        $guardados = Parametro::whereIn('clave', array_keys(self::CATALOGO))->pluck('valor', 'clave');

        $data = collect(self::CATALOGO)->map(function ($def, $clave) use ($guardados) {
            $valor = $guardados->has($clave) ? $guardados[$clave] : $def['default'];
            return [
                'clave'       => $clave,
                'etiqueta'    => $def['etiqueta'],
                'tipo'        => $def['tipo'],
                'descripcion' => $def['descripcion'],
                'valor'       => is_array($valor) ? ($valor['valor'] ?? $def['default']) : $valor,
            ];
        })->values();

        return response()->json(['data' => $data]);
    }

    public function update(Request $request)
    {
        $this->soloAdmin($request);

        $data = $request->validate([
            'clave' => ['required', 'string', \Illuminate\Validation\Rule::in(array_keys(self::CATALOGO))],
            'valor' => ['required', 'numeric', 'gte:0'],
        ]);

        $tipo  = self::CATALOGO[$data['clave']]['tipo'];
        $valor = $tipo === 'entero' ? (int) $data['valor'] : (float) $data['valor'];

        // Validaciones de coherencia
        if ($tipo === 'porcentaje' && ($valor <= 0 || $valor >= 1)) {
            abort(422, 'El porcentaje debe estar entre 0 y 1 (ej. 0.05 = 5%).');
        }
        if ($data['clave'] === 'seguro.porcentaje_min') {
            $max = (float) Parametro::valor('seguro.porcentaje_max', 0.10);
            if ($valor > $max) abort(422, 'El seguro mínimo no puede superar al máximo.');
        }
        if ($data['clave'] === 'seguro.porcentaje_max') {
            $min = (float) Parametro::valor('seguro.porcentaje_min', 0.05);
            if ($valor < $min) abort(422, 'El seguro máximo no puede ser menor al mínimo.');
        }

        Parametro::updateOrCreate(
            ['clave' => $data['clave']],
            ['valor' => $valor, 'descripcion' => self::CATALOGO[$data['clave']]['descripcion'], 'updated_at' => now()],
        );

        Cache::forget("param:{$data['clave']}");

        return response()->json(['message' => 'Parámetro actualizado.']);
    }
}
