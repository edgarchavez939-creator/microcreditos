<?php
namespace Database\Seeders;

use App\Models\Area;
use App\Models\LimiteAprobacion;
use App\Models\Usuario;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    /**
     * Datos imprescindibles para que una instalación limpia funcione: áreas
     * básicas y límites de aprobación. Sin usuarios ni cartera de prueba.
     */
    private function soloDatosEsenciales(): void
    {
        collect(['Norte', 'Centro', 'Sur'])
            ->each(fn ($n) => Area::firstOrCreate(['nombre' => $n], ['activa' => true]));
    }

    public function run(): void
    {
        // ============================================================
        // USUARIOS DE DEMOSTRACIÓN · NUNCA EN PRODUCCIÓN
        // ============================================================
        // Este seeder se ejecuta en cada despliegue. Si creara las cuentas de
        // prueba en producción, cualquiera que conozca el patrón entraría como
        // administrador —y en una plataforma multi-empresa, a los datos de TODOS
        // los clientes—. Borrarlas a mano no serviría: volverían al desplegar.
        //
        // Para poblar una instalación de demostración a propósito:
        //     php artisan db:seed --force   con SEED_DEMO=true
        $entorno = app()->environment();
        $permitirDemo = $entorno !== 'production' || env('SEED_DEMO', false);

        if (! $permitirDemo) {
            $this->command?->warn('Entorno de producción: no se crean usuarios de demostración.');
            $this->command?->line('Crea el primer administrador con: php artisan krypta:admin --email=... --nombre="..."');
            $this->soloDatosEsenciales();
            return;
        }

        $this->command?->warn('Creando datos de DEMOSTRACIÓN con contraseñas conocidas. No usar en producción.');

        $areas = collect(['Norte','Centro','Sur','Rural','Metropolitana'])
            ->map(fn ($n) => Area::firstOrCreate(['nombre' => $n], ['activa' => true]));

        $admin = Usuario::firstOrCreate(
            ['email' => 'admin@empresa.com'],
            ['nombre' => 'Administrador', 'password' => Hash::make('Admin12345*'), 'rol' => 'ADMINISTRADOR', 'activo' => true]
        );

        // Administrador Funcional (super-admin técnico, oculto para la operación).
        Usuario::firstOrCreate(
            ['email' => 'funcional@empresa.com'],
            ['nombre' => 'Admin Funcional', 'password' => Hash::make('Funcional12345*'), 'rol' => 'ADMIN_FUNCIONAL', 'activo' => true]
        );

        $supervisor = Usuario::firstOrCreate(
            ['email' => 'supervisor@empresa.com'],
            ['nombre' => 'Supervisor Norte', 'password' => Hash::make('Super12345*'), 'rol' => 'SUPERVISOR', 'activo' => true]
        );
        $supervisor->areas()->syncWithoutDetaching($areas->whereIn('nombre', ['Norte','Centro'])->pluck('id'));

        $cobrador = Usuario::firstOrCreate(
            ['email' => 'cobrador@empresa.com'],
            ['nombre' => 'Cobrador Norte', 'password' => Hash::make('Cobra12345*'), 'rol' => 'COBRADOR', 'activo' => true]
        );
        $cobrador->areas()->syncWithoutDetaching($areas->where('nombre', 'Norte')->pluck('id'));

        LimiteAprobacion::firstOrCreate(['rol' => 'SUPERVISOR', 'area_id' => null, 'usuario_id' => null], ['monto_maximo' => 3000000]);
        LimiteAprobacion::firstOrCreate(['rol' => 'ADMINISTRADOR', 'area_id' => null, 'usuario_id' => null], ['monto_maximo' => 999999999]);
    }
}
