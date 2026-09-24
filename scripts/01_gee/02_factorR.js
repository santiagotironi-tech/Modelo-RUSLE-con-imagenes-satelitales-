
// 02 — FACTOR R (EROSIVIDAD DE LA LLUVIA) — PRECIPITACIÓN MEDIA ANUAL CHIRPS
//
// El factor R de RUSLE se deriva de la precipitación media anual histórica.
// Este script calcula esa media (2000-2023) con CHIRPS y la exporta como
// GeoTIFF. La conversión final R = 1.3 × P se aplica en QGIS con la
// Calculadora Raster (no en GEE), sobre el archivo ya remuestreado a la
// resolución de trabajo.



// 1. ÁREA DE INTERÉS: bounding box amplio que cubre RM, Maule y Biobío

var regionChileCentral = ee.Geometry.BBox(-74.0, -38.5, -69.5, -32.0);


// 2. LÍNEA BASE HISTÓRICA: 24 años de datos diarios de CHIRPS

var inicioAnio = 2000;
var finAnio = 2023;
var chirps = ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY');
var anios = ee.List.sequence(inicioAnio, finAnio);


// 3. SUMA DE PRECIPITACIÓN POR AÑO (mm/año), UN VALOR POR AÑO

var precAnualColeccion = ee.ImageCollection(anios.map(function(y) {
  var inicio = ee.Date.fromYMD(y, 1, 1);
  var fin = ee.Date.fromYMD(y, 12, 31);
  var sumaAnual = chirps.filterDate(inicio, fin).sum().rename('P_anual');
  return sumaAnual.set('year', y);
}));


// 4. PROMEDIO DE LOS 24 AÑOS — este es el valor de P que usa el factor R

var precMediaAnual = precAnualColeccion.mean().clip(regionChileCentral);


// 5. VISUALIZACIÓN RÁPIDA

var visP = {
  min: 300, max: 2000,
  palette: ['blue', 'cyan', 'green', 'yellow', 'orange', 'red']
};
Map.centerObject(regionChileCentral, 6);
Map.addLayer(precMediaAnual, visP, 'Precipitación Media Anual (mm)');


// 6. EXPORTAR A GOOGLE DRIVE (resolución nativa de CHIRPS: ~5.5 km)

Export.image.toDrive({
  image: precMediaAnual,
  description: 'Precipitacion_Media_Anual_CHIRPS_2000_2023',
  folder: 'GEE_IPRE_Erosion',
  scale: 5500,
  region: regionChileCentral,
  fileFormat: 'GeoTIFF'
});
