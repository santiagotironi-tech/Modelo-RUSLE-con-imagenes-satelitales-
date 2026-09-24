
// 01 — CÁLCULO DE dNBR (SEVERIDAD DEL INCENDIO) CON SENTINEL-2
//
// Para cada uno de los 30 incendios (tabla "table" = BD_30IF.csv importado
// como asset): construye un buffer proporcional al área quemada, calcula el
// NBR pre y post incendio, y obtiene dNBR = NBR_pre - NBR_post. Exporta un
// mosaico raster único de dNBR para las 30 áreas.



// 1. CARGA DE INCENDIOS: convierte cada fila de la tabla en un punto (lat, lon)

var incendios = table.map(function(feature) {
  var featureObj = ee.Feature(feature);
  var lat = featureObj.getNumber('coord_operativas_lat');
  var lon = featureObj.getNumber('coord_operativas_lon');
  var punto = ee.Geometry.Point([lon, lat]);
  return featureObj.setGeometry(punto);
});

Map.centerObject(incendios, 7);


// 2. MÁSCARA DE NUBES (bits 10 y 11 de QA60) Y CÁLCULO DE NBR
// NBR = (NIR - SWIR2) / (NIR + SWIR2), usando las bandas B8 (NIR) y B12 (SWIR2).
var maskS2 = function(img) {
  var qa = img.select('QA60');
  var cloudBitMask = 1 << 10;
  var cirrusBitMask = 1 << 11;
  var mask = qa.bitwiseAnd(cloudBitMask).eq(0)
               .and(qa.bitwiseAnd(cirrusBitMask).eq(0));
  var nbr = img.normalizedDifference(['B8', 'B12']).rename('NBR');
  return img.updateMask(mask).addBands(nbr);
};

// Calcula el NBR mediano de la colección Sentinel-2 dentro de una ventana de
// fechas y un área (buffer) dados. Combina las colecciones SR y L1C
// (harmonizadas) para maximizar la disponibilidad de imágenes sin nubes.
// Si no hay ninguna imagen disponible, retorna una imagen constante -9999
// como valor centinela (se filtra explícitamente más adelante en el
// pipeline de R, nunca se usa como un valor real).
var calcularNBRSentinel2 = function(buffer, inicio, fin) {
  var s2_sr = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(buffer)
    .filterDate(inicio, fin)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 30))
    .map(maskS2)
    .select('NBR');

  var s2_l1c = ee.ImageCollection('COPERNICUS/S2_HARMONIZED')
    .filterBounds(buffer)
    .filterDate(inicio, fin)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 30))
    .map(maskS2)
    .select('NBR');

  var colCombinada = s2_sr.merge(s2_l1c);

  return ee.Image(ee.Algorithms.If(
    colCombinada.size().gt(0),
    colCombinada.median(),
    ee.Image.constant(-9999).rename('NBR')
  ));
};


// 3. PROCESAMIENTO PRINCIPAL POR INCENDIO

var procesarIncendio = function(feature) {
  var featureObj = ee.Feature(feature);

  // Fecha exacta del incendio, a partir de las columnas año/mes/día.
  var anio = featureObj.getNumber('year_inicio');
  var mes  = featureObj.getNumber('mes_inicio');
  var dia  = featureObj.getNumber('dia_inicio');
  var fechaIncendio = ee.Date.fromYMD(anio, mes, dia);

  // Ventanas temporales: 12 meses antes (hasta 2 días antes del inicio) y
  // 12 meses después (desde 2 días después) — evita mezclar imágenes del
  // día exacto del incendio, que pueden mostrar humo activo.
  var preInicio  = fechaIncendio.advance(-12, 'month');
  var preFin     = fechaIncendio.advance(-2, 'day');
  var postInicio = fechaIncendio.advance(2, 'day');
  var postFin    = fechaIncendio.advance(12, 'month');

  // Buffer proporcional al área quemada: radio = sqrt(área/π) × 5.5 — el
  // factor 5.5 amplía el buffer respecto al radio "equivalente" del
  // incendio para asegurar que cubra la extensión real e irregular de la
  // cicatriz, que casi nunca es un círculo perfecto.
  var superficie = featureObj.getNumber('superficie_total');
  var radio = superficie.multiply(10000).divide(Math.PI).sqrt().multiply(5.5);
  var bufferGeo = featureObj.geometry().buffer(radio);

  var nbrPre  = calcularNBRSentinel2(bufferGeo, preInicio, preFin);
  var nbrPost = calcularNBRSentinel2(bufferGeo, postInicio, postFin);

  var dNBR = nbrPre.subtract(nbrPost).rename('dNBR').clip(bufferGeo);

  // dNBRQuemado excluye píxeles con dNBR <= 0.1 (sin cambio detectable) para
  // el cálculo del promedio — evita que zonas no quemadas dentro del buffer
  // diluyan el valor medio de severidad real.
  var dNBRQuemado = dNBR.updateMask(dNBR.gt(0.1));

  var meanDict = dNBRQuemado.reduceRegion({
    reducer: ee.Reducer.mean(), geometry: bufferGeo, scale: 60, maxPixels: 1e8
  });
  var maxDict = dNBR.reduceRegion({
    reducer: ee.Reducer.max(), geometry: bufferGeo, scale: 60, maxPixels: 1e8
  });

  // Si reduceRegion no devuelve nada (por ejemplo, sin píxeles válidos),
  // se usa -9999 como valor centinela en vez de dejar el campo vacío.
  var meanVal = ee.Algorithms.If(meanDict.contains('dNBR'), meanDict.get('dNBR'), -9999);
  var maxVal  = ee.Algorithms.If(maxDict.contains('dNBR'),  maxDict.get('dNBR'),  -9999);

  return featureObj
    .setGeometry(bufferGeo)
    .set('dNBR_mean', meanVal)
    .set('dNBR_max', maxVal);
};

var resultados30 = ee.FeatureCollection(incendios.map(procesarIncendio));


// 4. MOSAICO ÚNICO DE dNBR (recalculado por buffer, para exportar como raster)

var coleccionDNBR = ee.ImageCollection(
  resultados30.toList(30).map(function(feature) {
    var fObj = ee.Feature(feature);
    var anio = fObj.getNumber('year_inicio');
    var mes  = fObj.getNumber('mes_inicio');
    var dia  = fObj.getNumber('dia_inicio');
    var fIncendio = ee.Date.fromYMD(anio, mes, dia);
    var buf = fObj.geometry();  // geometría del buffer ya calculado arriba

    var nPre  = calcularNBRSentinel2(buf, fIncendio.advance(-12, 'month'), fIncendio.advance(-2, 'day'));
    var nPost = calcularNBRSentinel2(buf, fIncendio.advance(2, 'day'),     fIncendio.advance(12, 'month'));

    return nPre.subtract(nPost).rename('dNBR').toFloat().clip(buf);
  })
);

var dNBRMosaico = coleccionDNBR.mosaic();


// 5. VISUALIZACIÓN (clasificación de severidad USGS)

var visParamDNBR = {
  min: -0.1, max: 0.66,
  palette: ['7a8738', '07e403', '96e403', 'fffd0c', 'e77001', 'e50600', '7b004c']
};

Map.addLayer(resultados30, {color: 'blue'}, 'Buffers (x5.5)');
Map.addLayer(dNBRMosaico, visParamDNBR, 'dNBR Severidad');
Map.addLayer(incendios, {color: 'red'}, 'Puntos Incendios');


// 6. EXPORTAR EL MOSAICO A GOOGLE DRIVE

var regionExport = resultados30.union(1).geometry();  // unión de los 30 buffers

Export.image.toDrive({
  image: dNBRMosaico.toFloat(),
  description: 'Mosaico_dNBR_Sentinel2_QGIS',
  folder: 'GEE_Incendios_QGIS',
  fileNamePrefix: 'dNBR_Severidad_Sentinel2',
  region: regionExport,
  scale: 60,
  maxPixels: 1e8,
  crs: 'EPSG:4326'
});
