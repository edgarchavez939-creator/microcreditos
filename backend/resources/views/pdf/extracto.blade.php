<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<style>
  * { font-family: DejaVu Sans, sans-serif; }
  body { color: #1e293b; font-size: 11px; margin: 0; }
  .header { background: #4f46e5; color: #fff; padding: 18px 24px; }
  .header h1 { margin: 0; font-size: 18px; }
  .header .sub { font-size: 11px; opacity: .85; margin-top: 2px; }
  .wrap { padding: 18px 24px; }
  .row { width: 100%; }
  .box { border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; margin-bottom: 12px; }
  .box h2 { margin: 0 0 6px; font-size: 12px; color: #4f46e5; }
  table { width: 100%; border-collapse: collapse; }
  .kv td { padding: 2px 4px; font-size: 11px; }
  .kv td.k { color: #64748b; width: 45%; }
  .kv td.v { font-weight: bold; text-align: right; }
  table.grid th { background: #f1f5f9; color: #475569; text-align: left; padding: 6px; font-size: 10px; border-bottom: 1px solid #e2e8f0; }
  table.grid td { padding: 5px 6px; font-size: 10px; border-bottom: 1px solid #f1f5f9; }
  .right { text-align: right; }
  .badge { font-size: 9px; padding: 1px 6px; border-radius: 8px; }
  .b-PAGADA { background: #dcfce7; color: #166534; }
  .b-PENDIENTE { background: #f1f5f9; color: #475569; }
  .b-PARCIAL { background: #fef9c3; color: #854d0e; }
  .b-VENCIDA { background: #fee2e2; color: #991b1b; }
  .foot { margin-top: 16px; font-size: 9px; color: #94a3b8; text-align: center; }
  .totales td { font-size: 12px; font-weight: bold; padding-top: 6px; }
</style>
</head>
<body>
  <div class="header">
    <h1>Extracto de crédito</h1>
    <div class="sub">{{ $empresa }} · Generado el {{ $generado }}</div>
  </div>

  <div class="wrap">
    <div class="box">
      <h2>Crédito {{ $s->numero_credito ?? ('#'.$s->id) }}</h2>
      <table class="row"><tr>
        <td style="width:50%; vertical-align:top;">
          <table class="kv">
            <tr><td class="k">Cliente</td><td class="v">{{ $cliente }}</td></tr>
            <tr><td class="k">Documento</td><td class="v">{{ $documento }}</td></tr>
            <tr><td class="k">Modalidad</td><td class="v">{{ $modalidad }}</td></tr>
            <tr><td class="k">Estado</td><td class="v">{{ $s->estado }}</td></tr>
          </table>
        </td>
        <td style="width:50%; vertical-align:top;">
          <table class="kv">
            <tr><td class="k">Capital aprobado</td><td class="v">{{ $money($s->monto_aprobado) }}</td></tr>
            <tr><td class="k">Total a recaudar</td><td class="v">{{ $money($s->total_recaudar) }}</td></tr>
            <tr><td class="k">Total pagado</td><td class="v">{{ $money($totalPagado) }}</td></tr>
            <tr><td class="k">Saldo pendiente</td><td class="v">{{ $money($saldo) }}</td></tr>
          </table>
        </td>
      </tr></table>
    </div>

    <div class="box">
      <h2>Plan de cuotas</h2>
      <table class="grid">
        <thead><tr>
          <th>#</th><th>Vence</th><th class="right">Valor</th>
          <th class="right">Pagado</th><th class="right">Saldo</th><th>Estado</th>
        </tr></thead>
        <tbody>
        @foreach ($cuotas as $c)
          <tr>
            <td>{{ $c['numero_cuota'] }}</td>
            <td>{{ $c['fecha_vencimiento'] }}</td>
            <td class="right">{{ $money($c['valor']) }}</td>
            <td class="right">{{ $money($c['valor_pagado']) }}</td>
            <td class="right">{{ $money($c['saldo']) }}</td>
            <td><span class="badge b-{{ $c['estado'] }}">{{ $c['estado'] }}</span></td>
          </tr>
        @endforeach
        </tbody>
      </table>
    </div>

    @if (count($pagos))
    <div class="box">
      <h2>Pagos registrados</h2>
      <table class="grid">
        <thead><tr><th>Fecha</th><th>Método</th><th class="right">Valor</th><th>Registró</th></tr></thead>
        <tbody>
        @foreach ($pagos as $p)
          <tr>
            <td>{{ $p['fecha'] }}</td>
            <td>{{ $p['metodo'] }}</td>
            <td class="right">{{ $money($p['valor']) }}</td>
            <td>{{ $p['registrado_por'] ?? '—' }}</td>
          </tr>
        @endforeach
        </tbody>
      </table>
    </div>
    @endif

    <div class="foot">
      Documento generado automáticamente por el sistema de {{ $empresa }}. Este extracto refleja el estado del crédito a la fecha de generación.
    </div>
  </div>
</body>
</html>
