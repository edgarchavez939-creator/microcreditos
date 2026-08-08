<?php

namespace App\Console\Commands;

use App\Models\Usuario;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/**
 * Da de alta al Administrador Funcional Global de la plataforma.
 *
 * Este rol pertenece a KRYPTA, no a ninguna empresa cliente, y por eso no puede
 * crearse desde la interfaz: no hay ninguna empresa desde la cual hacerlo. Se
 * ejecuta una sola vez, en el servidor:
 *
 *     php artisan krypta:admin-global --email=... --nombre="..."
 *
 * La contraseña se genera aquí y se muestra una única vez: no queda en el código,
 * ni en el repositorio, ni en un archivo de configuración.
 */
class CrearAdminGlobal extends Command
{
    protected $signature = 'krypta:admin-global
        {--email= : Correo del administrador global}
        {--nombre= : Nombre completo}
        {--password= : Contraseña (si se omite, se genera una segura)}';

    protected $description = 'Crea el Administrador Funcional Global de la plataforma KRYPTA.';

    public function handle(): int
    {
        $email = $this->option('email') ?: $this->ask('Correo del administrador global');
        $nombre = $this->option('nombre') ?: $this->ask('Nombre completo');

        $email = strtolower(trim((string) $email));
        if (! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $this->error('El correo no es válido.');
            return self::FAILURE;
        }

        // El contexto de empresa no aplica: este usuario está por encima.
        $existente = Usuario::withoutGlobalScopes()->whereRaw('LOWER(email) = ?', [$email])->first();
        if ($existente) {
            if ($existente->rol === 'ADMIN_GLOBAL') {
                $this->warn("Ya existe un administrador global con {$email}.");
                return self::SUCCESS;
            }
            $this->error("El correo {$email} ya pertenece a otro usuario del sistema.");
            return self::FAILURE;
        }

        $password = $this->option('password') ?: $this->generarPassword();

        DB::table('usuarios')->insert([
            'nombre'     => $nombre,
            'email'      => $email,
            'password'   => Hash::make($password),
            'rol'        => 'ADMIN_GLOBAL',
            'empresa_id' => null,          // no pertenece a ninguna empresa
            'activo'     => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->newLine();
        $this->info('Administrador Funcional Global creado.');
        $this->line("   Correo:     {$email}");
        if (! $this->option('password')) {
            $this->line("   Contraseña: {$password}");
            $this->newLine();
            $this->warn('Guarda esta contraseña ahora: no se volverá a mostrar. Cámbiala al entrar.');
        }

        return self::SUCCESS;
    }

    /** Contraseña legible pero fuerte, para entregarla una sola vez. */
    private function generarPassword(): string
    {
        $may = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // sin I ni O: se confunden al leer
        $min = 'abcdefghijkmnopqrstuvwxyz';
        $num = '23456789';
        $sim = '!@#$%&*';
        $todo = $may . $min . $num . $sim;

        $p = $may[random_int(0, strlen($may) - 1)]
           . $min[random_int(0, strlen($min) - 1)]
           . $num[random_int(0, strlen($num) - 1)]
           . $sim[random_int(0, strlen($sim) - 1)];

        for ($i = 0; $i < 12; $i++) {
            $p .= $todo[random_int(0, strlen($todo) - 1)];
        }

        return str_shuffle($p);
    }
}
