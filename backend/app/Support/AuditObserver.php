<?php

namespace App\Support;

use App\Models\Auditoria;
use Illuminate\Database\Eloquent\Model;

/**
 * Observa modelos y escribe en la tabla inmutable de auditoría.
 * Se registra desde AppServiceProvider::boot() sobre los modelos sensibles.
 */
class AuditObserver
{
    public function created(Model $model): void   { $this->log('CREATE', $model, null, $model->getAttributes()); }
    public function updated(Model $model): void    { $this->log('UPDATE', $model, $model->getOriginal(), $model->getChanges()); }
    public function deleted(Model $model): void    { $this->log('DELETE', $model, $model->getOriginal(), null); }

    private function log(string $accion, Model $model, ?array $antes, ?array $despues): void
    {
        $request = request();
        Auditoria::create([
            'usuario_id'       => optional(auth('api')->user())->id,
            'accion'           => $accion,
            'entidad'          => class_basename($model),
            'entidad_id'       => $model->getKey(),
            'datos_anteriores' => $antes ? json_encode($this->sanitizar($antes)) : null,
            'datos_nuevos'     => $despues ? json_encode($this->sanitizar($despues)) : null,
            'ip'               => $request?->ip(),
            'user_agent'       => $request?->userAgent(),
        ]);
    }

    /** No registrar campos sensibles en claro. */
    private function sanitizar(array $datos): array
    {
        foreach (['password','twofa_secret','token_hash','remember_token'] as $campo) {
            if (array_key_exists($campo, $datos)) {
                $datos[$campo] = '***';
            }
        }
        return $datos;
    }
}
