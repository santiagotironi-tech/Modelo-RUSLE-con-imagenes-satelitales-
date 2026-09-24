
// 03 — FACTOR LS (TOPOGRÁFICO) — WISCHMEIER Y SMITH (1978)
//
// Calcula el factor LS a partir de un DEM (ALOS PALSAR, 12.5m, subido como
// asset por región) para cada una de las 3 regiones de estudio.
//
// LIMITACIÓN METODOLÓGICA CONOCIDA (ver docs/metodologia.md): la fórmula
// cuadrática de Wischmeier y Smith fue calibrada con pendientes agrícolas
// moderadas. En terreno cordillerano, al tocar el límite de pendiente de
// 60% impuesto abajo, LS se satura en un valor de ~266 — muy por encima de
// los valores típicos (~10-20) de las zonas para las que la fórmula fue
// diseñada. Esto infla el RUSLE final en zonas de pendiente extrema.



// FUNCIÓN REUTILIZABLE: calcula y exporta el factor LS para un DEM dado
// (evita repetir 3 veces el mismo bloque de código, uno por región)

function calcularYExportarLS(rutaAsset, nombreRegion) {
  var dem = ee.Image(rutaAsset);
  var slope_grados = ee.Terrain.slope(dem).clip(dem.geometry());

  // Pendiente en % = tan(pendiente en grados) × 100, limitada a máximo 60%
  // (más allá de ese umbral, la fórmula original deja de ser confiable).
  var slope_pct = slope_grados.divide(180).multiply(Math.PI).tan().multiply(100).min(60);

  // LS = sqrt(500/22.13) × (0.76 + 0.53·S + 0.0065·S²), con S = pendiente en %
  var factorConstante = Math.sqrt(500 / 22.13);
  var terminoLineal = slope_pct.multiply(0.53);
  var terminoCuadratico = slope_pct.pow(2).multiply(0.0065);
  var LS = terminoLineal.add(terminoCuadratico).add(0.76).multiply(factorConstante).rename('LS');

  Export.image.toDrive({
    image: LS.toFloat(),
    description: 'Factor_LS_' + nombreRegion,
    folder: 'GEE_Incendios_QGIS',
    fileNamePrefix: 'Factor_LS_' + nombreRegion,
    region: dem.geometry(),
    scale: 30,
    maxPixels: 1e9,
    crs: 'EPSG:32719'
  });

  return LS;
}


// EJECUCIÓN PARA LAS 3 REGIONES

var LS_rm     = calcularYExportarLS('projects/ipre2026/assets/DEM_RM', 'RM');
var LS_maule  = calcularYExportarLS('projects/ipre2026/assets/DEM_MAULE', 'MAULE');
var LS_biobio = calcularYExportarLS('projects/ipre2026/assets/DEM_BIOBIO', 'BIOBIO');
