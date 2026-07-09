/**
 * Optimización del orden de visitas para la Ruta del Día.
 *
 * Estrategia: Nearest Neighbor (vecino más cercano) + refinamiento 2-opt.
 * - Distancia: Haversine (línea recta sobre el globo). Costo cero, sin llamadas de red,
 *   funciona sin señal. Suficiente para ORDENAR visitas a escala de 20–50 paradas.
 * - La función de distancia está aislada: para usar distancias reales por calle
 *   (Google Routes / Distance Matrix) en el futuro, se sustituye `distanciaKm` por una
 *   matriz de distancias precalculada, sin tocar el algoritmo de ordenamiento.
 */

export interface PuntoGeo {
  latitud?: number | null;
  longitud?: number | null;
}

/** Distancia en km entre dos coordenadas (fórmula de Haversine). */
export function distanciaKm(
  aLat: number, aLng: number, bLat: number, bLng: number,
): number {
  const R = 6371; // radio terrestre en km
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const lat1 = (aLat * Math.PI) / 180;
  const lat2 = (bLat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Tiempo aproximado (minutos) para una distancia, asumiendo velocidad urbana media. */
export function minutosAprox(km: number, kmh = 25): number {
  return Math.round((km / kmh) * 60);
}

type ConCoords<T> = T & { latitud: number; longitud: number };

function tienenCoords<T extends PuntoGeo>(p: T): p is ConCoords<T> {
  return p.latitud != null && p.longitud != null;
}

/**
 * Ordena las paradas minimizando el desplazamiento total.
 * @param paradas lista original
 * @param inicio  punto de partida (GPS del gestor). Si falta, arranca en la 1ª parada.
 * @returns objeto con la lista ordenada y metadatos por parada (distancia/tiempo desde la anterior)
 */
export function optimizarRuta<T extends PuntoGeo>(
  paradas: T[],
  inicio?: { latitud: number; longitud: number } | null,
): { orden: T[]; tramos: { km: number; min: number }[]; totalKm: number } {
  // Separar las que tienen coordenadas (optimizables) de las que no
  const conGeo = paradas.filter(tienenCoords);
  const sinGeo = paradas.filter((p) => !tienenCoords(p));

  if (conGeo.length <= 1) {
    return { orden: [...conGeo, ...sinGeo], tramos: [], totalKm: 0 };
  }

  // --- 1) Nearest Neighbor ---
  const n = conGeo.length;
  const visitado = new Array(n).fill(false);
  const rutaIdx: number[] = [];

  // Elegir el punto inicial: el más cercano al GPS, o el primero si no hay GPS
  let actual: number;
  if (inicio) {
    actual = 0; let mejor = Infinity;
    for (let i = 0; i < n; i++) {
      const d = distanciaKm(inicio.latitud, inicio.longitud, conGeo[i].latitud, conGeo[i].longitud);
      if (d < mejor) { mejor = d; actual = i; }
    }
  } else {
    actual = 0;
  }
  visitado[actual] = true;
  rutaIdx.push(actual);

  for (let paso = 1; paso < n; paso++) {
    let mejor = Infinity, sig = -1;
    const a = conGeo[actual];
    for (let i = 0; i < n; i++) {
      if (visitado[i]) continue;
      const d = distanciaKm(a.latitud, a.longitud, conGeo[i].latitud, conGeo[i].longitud);
      if (d < mejor) { mejor = d; sig = i; }
    }
    visitado[sig] = true;
    rutaIdx.push(sig);
    actual = sig;
  }

  // --- 2) Refinamiento 2-opt (deshace cruces; barato para <= ~200 paradas) ---
  const dist = (i: number, j: number) =>
    distanciaKm(conGeo[i].latitud, conGeo[i].longitud, conGeo[j].latitud, conGeo[j].longitud);

  let mejoro = true;
  let vueltas = 0;
  while (mejoro && vueltas < 20) {
    mejoro = false;
    vueltas++;
    for (let i = 0; i < rutaIdx.length - 1; i++) {
      for (let k = i + 1; k < rutaIdx.length; k++) {
        const a = rutaIdx[i - 1] ?? -1;
        const b = rutaIdx[i];
        const c = rutaIdx[k];
        const d = rutaIdx[k + 1] ?? -1;
        // costo actual vs. costo si invertimos el segmento i..k
        const antes = (a >= 0 ? dist(a, b) : 0) + (d >= 0 ? dist(c, d) : 0);
        const despues = (a >= 0 ? dist(a, c) : 0) + (d >= 0 ? dist(b, d) : 0);
        if (despues + 1e-9 < antes) {
          // invertir segmento
          let lo = i, hi = k;
          while (lo < hi) { [rutaIdx[lo], rutaIdx[hi]] = [rutaIdx[hi], rutaIdx[lo]]; lo++; hi--; }
          mejoro = true;
        }
      }
    }
  }

  // --- Construir salida con tramos (distancia/tiempo desde la parada anterior) ---
  const orden = rutaIdx.map((i) => conGeo[i]);
  const tramos: { km: number; min: number }[] = [];
  let totalKm = 0;

  orden.forEach((p, idx) => {
    let km = 0;
    if (idx === 0) {
      km = inicio ? distanciaKm(inicio.latitud, inicio.longitud, p.latitud, p.longitud) : 0;
    } else {
      const prev = orden[idx - 1];
      km = distanciaKm(prev.latitud, prev.longitud, p.latitud, p.longitud);
    }
    totalKm += km;
    tramos.push({ km, min: minutosAprox(km) });
  });

  // Las paradas sin coordenadas van al final (no se pueden optimizar)
  return { orden: [...orden, ...sinGeo], tramos, totalKm: Math.round(totalKm * 10) / 10 };
}
