<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

/**
 * Verifica la matemática de reamortización contra los ejemplos de la especificación.
 * (Cálculos puros, sin BD.)
 */
class ReamortizacionTest extends TestCase
{
    private function calc(float $capital, float $pctSeguro, float $tasaMensual, int $meses, float $saldo): array
    {
        $seguro          = round($capital * $pctSeguro, 2);
        $valorDesembolso = round($capital - $seguro, 2);
        $interes         = round($capital * $tasaMensual * $meses, 2);
        $totalDeuda      = round($capital + $interes, 2);
        $dineroAdicional = round($capital - $saldo, 2);
        $recibido        = round(max($valorDesembolso - $saldo, 0), 2);
        return compact('seguro','valorDesembolso','interes','totalDeuda','dineroAdicional','recibido');
    }

    public function test_credito_inicial_interes_simple_y_seguro(): void
    {
        // Capital 1.000.000, seguro 5%, 10% mensual x 3 meses
        $r = $this->calc(1000000, 0.05, 0.10, 3, 0);
        $this->assertSame(50000.0, $r['seguro']);
        $this->assertSame(950000.0, $r['valorDesembolso']);   // cliente recibe 950.000
        $this->assertSame(300000.0, $r['interes']);           // 1.000.000 x 0.10 x 3
        $this->assertSame(1300000.0, $r['totalDeuda']);       // deuda sobre capital, sin seguro
    }

    public function test_saldo_pendiente(): void
    {
        // Total deuda 1.300.000 − pagos 500.000 = 800.000
        $saldo = round(1300000 - 500000, 2);
        $this->assertSame(800000.0, $saldo);
    }

    public function test_reamortizacion_opcion2_nuevo_prestamo(): void
    {
        // Saldo 800.000; nuevo capital 900.000; seguro 8%; 10% mensual x 3
        $saldo = 800000.0;
        $r = $this->calc(900000, 0.08, 0.10, 3, $saldo);
        $this->assertSame(72000.0, $r['seguro']);
        $this->assertSame(828000.0, $r['valorDesembolso']);   // desembolso bruto
        $this->assertSame(270000.0, $r['interes']);           // 900.000 x 0.10 x 3
        $this->assertSame(1170000.0, $r['totalDeuda']);       // nueva deuda
        $this->assertSame(100000.0, $r['dineroAdicional']);   // 900.000 − 800.000
        $this->assertSame(28000.0, $r['recibido']);           // 828.000 − 800.000 (efectivo neto)
    }

    public function test_interes_nunca_sobre_desembolsado(): void
    {
        // El interés se calcula sobre 900.000, no sobre 828.000
        $r = $this->calc(900000, 0.08, 0.10, 3, 800000);
        $this->assertSame(270000.0, $r['interes']);
        $this->assertNotSame(round(828000 * 0.10 * 3, 2), $r['interes']);
    }

    public function test_seguro_no_hace_parte_de_la_deuda(): void
    {
        $r = $this->calc(900000, 0.08, 0.10, 3, 800000);
        // Deuda = capital + interés, sin sumar el seguro
        $this->assertSame(round(900000 + $r['interes'], 2), $r['totalDeuda']);
    }

    public function test_reduccion_de_cupo(): void
    {
        $reduccion = 100000;
        $cupo = 1000000;
        $secuencia = [];
        for ($i = 0; $i < 3; $i++) { $cupo -= $reduccion; $secuencia[] = $cupo; }
        $this->assertSame([900000, 800000, 700000], $secuencia);
    }
}
