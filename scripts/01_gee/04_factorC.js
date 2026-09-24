
// 04 — FACTOR C POST-INCENDIO (COBERTURA VEGETAL) — VAN DER KNIJFF ET AL. (2000)
//
// Calcula el factor C usando NDVI de la ventana posterior al incendio
// (vegetación ya quemada / en recuperación temprana). Es el único de los
// 4 factores RUSLE que cambia por efecto del fuego — R, K y LS son
// independientes del incendio.
//
// Companion: 05_factor_C_pre.js calcula lo mismo pero con NDVI de la ventana
// PREVIA al incendio, para poder estimar el incremento de erosión
// atribuible al fuego (ΔRUSLE = RUSLE_post − RUSLE_pre).



// 1. CARGA DE INCENDIOS

var incendios = table.map(function(feature) {
  var featureObj = ee.Feature(feature);
  var lat = featureObj.getNumber('coord_operativas_lat');
  var lon = featureObj.getNumber('coord_operativas_lon');
  var punto = ee.Geometry.Point([lon, lat]);
  return featureObj.setGeometry(punto);
});


// 2. MÁSCARA DE NUBES Y CÁLCULO DE NDVI = (NIR - RED) / (NIR + RED)

var maskS2_ndvi = function(img) {
  var qa = img.select('QA60');
  var cloudBitMask = 1 << 10;
  var cirrusBitMask = 1 << 11;
  var mask = qa.bitwiseAnd(cloudBitMask).eq(0)
               .and(qa.bitwiseAnd(cirrusBitMask).eq(0));
  var ndvi = img.normalizedDifference(['B8', 'B4']).rename('NDVI');
  return img.updateMask(mask).addBands(ndvi);
};

var calcularNDVI = function(buffer, inicio, fin) {
  var col = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(buffer)
    .filterDate(inicio, fin)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 30))
    .map(maskS2_ndvi)
    .select('NDVI');

  return ee.Image(ee.Algorithms.If(
    col.size().gt(0),
    col.median(),
    ee.Image.constant(-9999).rename('NDVI')
  ));
};


// 3. FUNCIÓN FACTOR C POR INCENDIO (VENTANA POST-INCENDIO)

var procesarFactorC = function(feature) {
  var featureObj = ee.Feature(feature);

  var anio = featureObj.getNumber('year_inicio');
  var mes  = featureObj.getNumber('mes_inicio');
  var dia  = featureObj.getNumber('dia_inicio');
  var fechaIncendio = ee.Date.fromYMD(anio, mes, dia);

  var postInicio = fechaIncendio.advance(2, 'day');
  var postFin    = fechaIncendio.advance(12, 'month');

  var superficie = featureObj.getNumber('superficie_total');
  var radio = superficie.multiply(10000).divide(Math.PI).sqrt().multiply(5.5);
  var bufferGeo = featureObj.geometry().buffer(radio);

  var ndvi = calcularNDVI(bufferGeo, postInicio, postFin);

  // Fórmula de Van der Knijff: C = exp(-2 × NDVI / (1 - NDVI))
  var alpha = ee.Number(-2);
  var C_raw = ndvi.multiply(alpha).divide(ee.Image(1).subtract(ndvi)).exp();

  // Normalización min-max a [0, 1], calculada dentro del mismo buffer
  var maxC = C_raw.reduceRegion({ reducer: ee.Reducer.max(), geometry: bufferGeo, scale: 60, maxPixels: 1e8 });
  var minC = C_raw.reduceRegion({ reducer: ee.Reducer.min(), geometry: bufferGeo, scale: 60, maxPixels: 1e8 });
  var C_max = ee.Image.constant(ee.Number(maxC.get('NDVI')));
  var C_min = ee.Image.constant(ee.Number(minC.get('NDVI')));
  var C_factor = C_raw.subtract(C_min).divide(C_max.subtract(C_min)).rename('C');

  var meanDict = C_factor.reduceRegion({
    reducer: ee.Reducer.mean(), geometry: bufferGeo, scale: 60, maxPixels: 1e8
  });
  var meanVal = ee.Algorithms.If(meanDict.contains('C'), meanDict.get('C'), -9999);

  return featureObj.setGeometry(bufferGeo).set('C_mean', meanVal);
};

var resultadosC = ee.FeatureCollection(incendios.map(procesarFactorC));


// 4. MOSAICO DEL FACTOR C

var coleccionC = ee.ImageCollection(
  resultadosC.toList(30).map(function(feature) {
    var fObj = ee.Feature(feature);
    var anio = fObj.getNumber('year_inicio');
    var mes  = fObj.getNumber('mes_inicio');
    var dia  = fObj.getNumber('dia_inicio');
    var fIncendio = ee.Date.fromYMD(anio, mes, dia);
    var buf = fObj.geometry();

    var ndvi = calcularNDVI(buf, fIncendio.advance(2, 'day'), fIncendio.advance(12, 'month'));
    var alpha = ee.Number(-2);
    var C_raw = ndvi.multiply(alpha).divide(ee.Image(1).subtract(ndvi)).exp();

    var maxC = C_raw.reduceRegion({ reducer: ee.Reducer.max(), geometry: buf, scale: 60, maxPixels: 1e8 });
    var minC = C_raw.reduceRegion({ reducer: ee.Reducer.min(), geometry: buf, scale: 60, maxPixels: 1e8 });
    var C_max = ee.Image.constant(ee.Number(maxC.get('NDVI')));
    var C_min = ee.Image.constant(ee.Number(minC.get('NDVI')));

    return C_raw.subtract(C_min).divide(C_max.subtract(C_min)).rename('C').toFloat().clip(buf);
  })
);

var CMosaico = coleccionC.mosaic();
Map.addLayer(CMosaico, {min: 0, max: 1, palette: ['white', 'green']}, 'Factor C (post-incendio)');


// 5. EXPORTACIONES

var regionExport = resultadosC.union(1).geometry();

Export.table.toDrive({
  collection: resultadosC,
  description: 'Factor_C_Incendios',
  fileFormat: 'CSV'
});

Export.image.toDrive({
  image: CMosaico.toFloat(),
  description: 'Mosaico_Factor_C',
  folder: 'GEE_Incendios_QGIS',
  fileNamePrefix: 'Factor_C_Sentinel2',
  region: regionExport,
  scale: 60,
  maxPixels: 1e8,
  crs: 'EPSG:4326'
});
