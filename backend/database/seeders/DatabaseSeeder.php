<?php
namespace Database\Seeders;

use App\Models\Area;
use App\Models\LimiteAprobacion;
use App\Models\Usuario;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $areas = collect(['Norte','Centro','Sur','Rural','Metropolitana'])
            ->map(fn ($n) => Area::firstOrCreate(['nombre' => $n], ['activa' => true]));

        $admin = Usuario::firstOrCreate(
            ['email' => 'admin@empresa.com'],
            ['nombre' => 'Administrador', 'password' => Hash::make('Admin12345*'), 'rol' => 'ADMINISTRADOR', 'activo' => true]
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
