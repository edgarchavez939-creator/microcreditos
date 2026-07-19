<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Usuario;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * BÚSQUEDA GLOBAL — un único endpoint que consulta varias entidades a la vez
 * (clientes, créditos, usuarios, productos) respetando el modelo territorial:
 * cada usuario solo encuentra lo que tiene permitido ver por sus áreas.
 *
 * Devuelve resultados agrupados por tipo, con el mínimo necesario para navegar.
 */
class BusquedaController extends Controller
{
    public function global(Request $request)
    {
        $q = trim((string) $request->query('q', ''));
        if (mb_strlen($q) < 2) {
            return response()->json(['data' => []]);
        }

        $u = $request->user();
        $areas = $u->areasVisibles();          // null = sin restricción (admin/funcional)
        $like = '%' . str_replace(['%', '_'], ['\%', '\_'], $q) . '%';
        $soloDigitos = preg_replace('/\D/', '', $q);

        $resultados = [];

        // --- CLIENTES (por nombre, documento o teléfono), filtrados por área ---
        $clientes = DB::table('clientes as c')
            ->leftJoin('areas as a', 'a.id', '=', 'c.area_id')
            ->where(function ($w) use ($like, $soloDigitos) {
                $w->where(DB::raw("c.nombres || ' ' || c.apellidos"), 'ILIKE', $like)
                  ->orWhere('c.numero_documento', 'ILIKE', $like);
                if ($soloDigitos !== '') {
                    $w->orWhere('c.telefono_principal', 'ILIKE', '%' . $soloDigitos . '%');
                }
            })
            ->when($areas !== null, fn ($qq) => $qq->whereIn('c.area_id', $areas))
            ->orderBy('c.nombres')
            ->limit(6)
            ->get(['c.id', 'c.nombres', 'c.apellidos', 'c.numero_documento', 'a.nombre as area']);

        foreach ($clientes as $c) {
            $resultados[] = [
                'tipo' => 'cliente', 'id' => $c->id,
                'titulo' => trim("{$c->nombres} {$c->apellidos}"),
                'detalle' => "Doc. {$c->numero_documento}" . ($c->area ? " · {$c->area}" : ''),
            ];
        }

        // --- CRÉDITOS (por número), filtrados por área del cliente ---
        $creditos = DB::table('solicitudes as s')
            ->join('clientes as c', 'c.id', '=', 's.cliente_id')
            ->where('s.numero_credito', 'ILIKE', $like)
            ->when($areas !== null, fn ($qq) => $qq->whereIn('c.area_id', $areas))
            ->orderByDesc('s.created_at')
            ->limit(6)
            ->get(['s.id', 's.numero_credito', 's.estado', 'c.id as cliente_id', 'c.nombres', 'c.apellidos']);

        foreach ($creditos as $cr) {
            $resultados[] = [
                'tipo' => 'credito', 'id' => $cr->id, 'cliente_id' => $cr->cliente_id,
                'titulo' => $cr->numero_credito ?: "Crédito #{$cr->id}",
                'detalle' => trim("{$cr->nombres} {$cr->apellidos}") . " · " . str_replace('_', ' ', $cr->estado),
            ];
        }

        // --- USUARIOS y PRODUCTOS: solo para administración ---
        if ($u->esAdministrador() || $u->esAdminFuncional()) {
            $usuarios = DB::table('usuarios')
                ->where('activo', true)
                ->where(fn ($w) => $w->where('nombre', 'ILIKE', $like)->orWhere('email', 'ILIKE', $like))
                ->limit(5)
                ->get(['id', 'nombre', 'rol', 'email']);
            foreach ($usuarios as $us) {
                $resultados[] = [
                    'tipo' => 'usuario', 'id' => $us->id,
                    'titulo' => $us->nombre, 'detalle' => ucfirst(strtolower(str_replace('_', ' ', $us->rol))),
                ];
            }

            $productos = DB::table('productos_financieros')
                ->where(fn ($w) => $w->where('nombre', 'ILIKE', $like)->orWhere('codigo', 'ILIKE', $like))
                ->limit(4)
                ->get(['id', 'nombre', 'codigo', 'activo']);
            foreach ($productos as $p) {
                $resultados[] = [
                    'tipo' => 'producto', 'id' => $p->id,
                    'titulo' => $p->nombre, 'detalle' => $p->codigo . ($p->activo ? '' : ' · inactivo'),
                ];
            }
        }

        return response()->json(['data' => $resultados]);
    }
}
