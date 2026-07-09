<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\OtpService;
use Illuminate\Http\Request;

class OtpController extends Controller
{
    /** Genera un código OTP para una operación crítica (solo administrador). */
    public function generar(Request $request, OtpService $otp)
    {
        abort_unless($request->user()->esAdministrador(), 403, 'Solo el administrador puede generar códigos de seguridad.');

        $data = $request->validate([
            'operacion' => ['required', 'string', \Illuminate\Validation\Rule::in(array_keys(OtpService::OPERACIONES))],
        ]);

        return response()->json(['data' => $otp->generar($request->user(), $data['operacion'])], 201);
    }
}
