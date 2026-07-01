<?php
namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Area;
use Illuminate\Http\Request;

class AreaController extends Controller
{
    public function index(Request $request)
    {
        $u = $request->user();
        $query = Area::query()->where('activa', true)->orderBy('nombre');

        // El cobrador y el supervisor solo ven sus áreas; el admin todas.
        if (! $u->esAdministrador()) {
            $query->whereIn('id', $u->areas()->pluck('areas.id'));
        }

        return response()->json([
            'data' => $query->get(['id', 'nombre'])->map(fn ($a) => [
                'id' => $a->id, 'nombre' => $a->nombre,
            ]),
        ]);
    }

    public function cobradores(Request $request)
    {
        $u = $request->user();
        $query = \App\Models\Usuario::query()->where('rol', 'COBRADOR')->where('activo', true)->orderBy('nombre');

        // El supervisor solo ve cobradores de sus áreas; el admin todos.
        if ($u->esSupervisor()) {
            $areas = $u->areas()->pluck('areas.id');
            $query->whereHas('areas', fn ($q) => $q->whereIn('areas.id', $areas));
        }

        return response()->json([
            'data' => $query->get(['id', 'nombre'])->map(fn ($c) => ['id' => $c->id, 'nombre' => $c->nombre]),
        ]);
    }
}
