<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/**
 * Crea el primer administrador de una empresa.
 *
 * Existe porque en producción el seeder ya no crea usuarios de demostración: sin
 * este comando no habría forma de entrar por primera vez a una instalación limpia
 * ni a una empresa recién dada de alta.
 *
 *     php artisan krypta:admin --empresa=1 --email=... --nombre="..."
 *
 * La contraseña se genera aquí, se muestra una sola vez y queda marcada para
 * cambio obligatorio en el primer ingreso: quien la crea no debe conservarla.
 */
class CrearAdminEmpresa extends Command
{
    protected $signature = 'krypta:admin
        {--empresa= : Id de la empresa}
        {--email= : Correo del administrador}
        {--nombre= : Nombre completo}';

    protected $description = 'Crea el primer administrador de una empresa.';

    public function handle(): int
    {
        $empresaId = (int) ($this->option('empresa') ?: $this->ask('Id de la empresa', '1'));
        $email = strtolower(trim((string) ($this->option('email') ?: $this->ask('Correo'))));
        $nombre = (string) ($this->option('nombre') ?: $this->ask('Nombre completo'));

        if (! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $this->error('El correo no es válido.');
            return self::FAILURE;
        }

        $empresa = DB::table('empresas')->where('id', $empresaId)->first(['id', 'nombre']);
        if (! $empresa) {
            $this->error("No existe la empresa {$empresaId}.");
            return self::FAILURE;
        }

        $existe = DB::table('usuarios')->whereRaw('LOWER(email) = ?', [$email])->exists();
        if ($existe) {
            $this->error("Ya existe un usuario con el correo {$email}.");
            return self::FAILURE;
        }

        $password = $this->generarPassword();

        DB::table('usuarios')->insert([
            'nombre'     => $nombre,
            'email'      => $email,
            'password'   => Hash::make($password),
            'rol'        => 'ADMINISTRADOR',
            'empresa_id' => $empresaId,
            'activo'     => true,
            'debe_cambiar_password' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->newLine();
        $this->info("Administrador creado para «{$empresa->nombre}».");
        $this->line("   Correo:     {$email}");
        $this->line("   Contraseña: {$password}");
        $this->newLine();
        $this->warn('Entrégala por un canal seguro. Se le pedirá cambiarla al entrar.');

        return self::SUCCESS;
    }

    private function generarPassword(): string
    {
        $may = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // sin I ni O: se confunden al dictar
        $min = 'abcdefghijkmnopqrstuvwxyz';
        $num = '23456789';
        $sim = '!@#$%&*';
        $todo = $may . $min . $num . $sim;

        $p = $may[random_int(0, strlen($may) - 1)]
           . $min[random_int(0, strlen($min) - 1)]
           . $num[random_int(0, strlen($num) - 1)]
           . $sim[random_int(0, strlen($sim) - 1)];

        for ($i = 0; $i < 10; $i++) {
            $p .= $todo[random_int(0, strlen($todo) - 1)];
        }

        return str_shuffle($p);
    }
}
