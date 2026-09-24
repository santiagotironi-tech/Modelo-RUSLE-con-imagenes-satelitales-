/
// 05 — FACTOR C PRE-INCENDIO (COBERTURA VEGETAL) — VAN DER KNIJFF ET AL. (2000)
//
// Idéntico a 04_factor_C_post.js en método (misma máscara de nubes, misma
// fórmula, misma normalización), pero usando NDVI de la ventana PREVIA al
// incendio (-12 meses a -2 días antes del inicio, la misma ventana que ya
// se usa para NBR_pre en 01_dNBR_severidad.js).
//
// Uso: RUSLE_pre = R × K × LS × C_pre (multiplicación hecha en QGIS, R/K/LS
// son los mismos que para el post-incendio). ΔRUSLE = RUSLE_post - RUSLE_pre
// cuantifica el incremento de erosión atribuible específicamente al fuego.



// 1. CARGA DE INCENDIOS

var incendios = table.map(function(feature) {
  var featureObj = ee.Feature(feature);
  var lat = featureObj.getNumber('coord_operativas_lat');
  var lon = featureObj.getNumber('coord_operativas_lon');
  var punto = ee.Geometry.Point([lon, lat]);
  return featureObj.setGeometry(punto);
});


// 2. MÁSCARA DE NUBES Y CÁLCULO DE NDVI

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


// 3. FUNCIÓN FACTOR C POR INCENDIO (VENTANA PRE-INCENDIO)

var procesarFactorC_pre = function(feature) {
  var featureObj = ee.Feature(feature);

  var anio = featureObj.getNumber('year_inicio');
  var mes  = featureObj.getNumber('mes_inicio');
  var dia  = featureObj.getNumber('dia_inicio');
  var fechaIncendio = ee.Date.fromYMD(anio, mes, dia);

  // Ventana PRE-incendio: -12 meses a -2 días antes del inicio.
  var preInicio = fechaIncendio.advance(-12, 'month');
  var preFin    = fechaIncendio.advance(-2, 'day');

  var superficie = featureObj.getNumber('superficie_total');
  var radio = superficie.multiply(10000).divide(Math.PI).sqrt().multiply(5.5);
  var bufferGeo = featureObj.geometry().buffer(radio);

  var ndvi = calcularNDVI(bufferGeo, preInicio, preFin);

  var alpha = ee.Number(-2);
  var C_raw = ndvi.multiply(alpha).divide(ee.Image(1).subtract(ndvi)).exp();

  var maxC = C_raw.reduceRegion({ reducer: ee.Reducer.max(), geometry: bufferGeo, scale: 60, maxPixels: 1e8 });
  var minC = C_raw.reduceRegion({ reducer: ee.Reducer.min(), geometry: bufferGeo, scale: 60, maxPixels: 1e8 });
  var C_max = ee.Image.constant(ee.Number(maxC.get('NDVI')));
  var C_min = ee.Image.constant(ee.Number(minC.get('NDVI')));
  var C_factor = C_raw.subtract(C_min).divide(C_max.subtract(C_min)).rename('C');

  var meanDict = C_factor.reduceRegion({
    reducer: ee.Reducer.mean(), geometry: bufferGeo, scale: 60, maxPixels: 1e8
  });
  var meanVal = ee.Algorithms.If(meanDict.contains('C'), meanDict.get('C'), -9999);

  // Nota: nombre de campo distinto (C_mean_pre) para no chocar con el
  // C_mean del factor post-incendio al cruzar ambas tablas en R.
  return featureObj.setGeometry(bufferGeo).set('C_mean_pre', meanVal);
};

var resultadosC_pre = ee.FeatureCollection(incendios.map(procesarFactorC_pre));


// 4. MOSAICO DEL FACTOR C PRE-INCENDIO

var coleccionC_pre = ee.ImageCollection(
  resultadosC_pre.toList(30).map(function(feature) {
    var fObj = ee.Feature(feature);
    var anio = fObj.getNumber('year_inicio');
    var mes  = fObj.getNumber('mes_inicio');
    var dia  = fObj.getNumber('dia_inicio');
    var fIncendio = ee.Date.fromYMD(anio, mes, dia);
    var buf = fObj.geometry();

    var ndvi = calcularNDVI(buf, fIncendio.advance(-12, 'month'), fIncendio.advance(-2, 'day'));
    var alpha = ee.Number(-2);
    var C_raw = ndvi.multiply(alpha).divide(ee.Image(1).subtract(ndvi)).exp();

    var maxC = C_raw.reduceRegion({ reducer: ee.Reducer.max(), geometry: buf, scale: 60, maxPixels: 1e8 });
    var minC = C_raw.reduceRegion({ reducer: ee.Reducer.min(), geometry: buf, scale: 60, maxPixels: 1e8 });
    var C_max = ee.Image.constant(ee.Number(maxC.get('NDVI')));
    var C_min = ee.Image.constant(ee.Number(minC.get('NDVI')));

    return C_raw.subtract(C_min).divide(C_max.subtract(C_min)).rename('C').toFloat().clip(buf);
  })
);

var CMosaico_pre = coleccionC_pre.mosaic();
Map.addLayer(CMosaico_pre, {min: 0, max: 1, palette: ['white', 'green']}, 'Factor C (pre-incendio)');


// 5. EXPORTACIONES

var regionExport = resultadosC_pre.union(1).geometry();

Export.table.toDrive({
  collection: resultadosC_pre,
  description: 'Factor_C_Pre_Incendios',
  fileFormat: 'CSV'
});

Export.image.toDrive({
  image: CMosaico_pre.toFloat(),
  description: 'Mosaico_Factor_C_Pre',
  folder: 'GEE_Incendios_QGIS',
  fileNamePrefix: 'Factor_C_Pre_Sentinel2',
  region: regionExport,
  scale: 60,
  maxPixels: 1e8,
  crs: 'EPSG:4326'
});
