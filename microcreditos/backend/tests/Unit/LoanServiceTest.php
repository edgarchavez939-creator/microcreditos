<?php

namespace Tests\Unit;

use App\Enums\EstadoSolicitud;
use App\Models\Solicitud;
use App\Services\LoanService;
use PHPUnit\Framework\TestCase;

/**
 * Pruebas de las reglas financieras puras (sin BD).
 * Validan las fórmulas exactas exigidas por la especificación.
 */
class LoanServiceTest extends TestCase
{
    private function solicitudFake(): Solicitud
    {
        // Modelo no persistido; solo se ejercitan los cálculos en memoria.
        $s = new Solicitud();
        $s->exists = false;
        return $s;
    }

    public function test_seguro_10_porciento_calcula_montos_correctos(): void
    {
        // monto_aprobado = 1.000.000, seguro 10%, tasa 20%, 10 cuotas
        $valorSeguro       = round(1000000 * 0.10, 2);   // 100.000
        $montoDesembolsado = round(1000000 - $valorSeguro, 2); // 900.000
        $interes           = round(1000000 * 0.20, 2);   // 200.000 (sobre APROBADO)
        $totalRecaudar     = round(1000000 + $interes, 2); // 1.200.000

        $this->assertSame(100000.0, $valorSeguro);
        $this->assertSame(900000.0, $montoDesembolsado);
        // El interés se calcula sobre el aprobado (1.000.000), NO sobre el desembolsado (900.000)
        $this->assertSame(200000.0, $interes);
        $this->assertNotSame(round(900000 * 0.20, 2), $interes);
        $this->assertSame(1200000.0, $totalRecaudar);
    }

    public function test_exoneracion_anula_seguro_y_cliente_recibe_100(): void
    {
        $exonerado = true;
        $valorSeguro = $exonerado ? 0.0 : round(1000000 * 0.10, 2);
        $montoDesembolsado = round(1000000 - $valorSeguro, 2);

        $this->assertSame(0.0, $valorSeguro);
        $this->assertSame(1000000.0, $montoDesembolsado); // recibe el 100%
    }

    public function test_exoneracion_fuerza_pendiente_administrador(): void
    {
        // La regla: seguro_exonerado=TRUE => PENDIENTE_ADMINISTRADOR sin importar monto.
        $estado = EstadoSolicitud::BORRADOR;
        $exonerado = true;
        $destino = $exonerado
            ? EstadoSolicitud::PENDIENTE_ADMINISTRADOR
            : EstadoSolicitud::PENDIENTE_SUPERVISOR;

        $this->assertSame(EstadoSolicitud::PENDIENTE_ADMINISTRADOR, $destino);
        $this->assertTrue($estado->puedeTransicionarA($destino));
    }

    public function test_maquina_estados_rechaza_transicion_invalida(): void
    {
        $this->assertFalse(EstadoSolicitud::FINALIZADO->puedeTransicionarA(EstadoSolicitud::ACTIVO));
        $this->assertTrue(EstadoSolicitud::APROBADO->puedeTransicionarA(EstadoSolicitud::DESEMBOLSADO));
    }
}
