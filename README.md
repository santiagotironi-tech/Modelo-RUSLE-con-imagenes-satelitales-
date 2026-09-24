# Modelo-RUSLE-con-imagenes-satelitales-
Erosión post-incendio en Chile central (RM, Maule, Biobío)

IPRE (Investigación de Pregrado) — Ingeniería Forestal, Pontificia Universidad Católica de Chile. Profesor guía: Horacio Gilabert.

Objetivo

Establecer relaciones empíricas entre la severidad de incendios forestales (dNBR) y el potencial de erosión del suelo (RUSLE), a partir de 30 incendios ocurridos entre 2015 y 2025 en las regiones Metropolitana, Maule y Biobío, más un caso de estudio detallado (incendio de San Carlos de Apoquindo, 29-12-2025).

Pipeline general
Selección de la muestra (R): filtrado de la base nacional de incendios (2002-2025) por región, superficie (≥ percentil 99), año (≥2015) y disponibilidad de coordenadas. Selección estratificada de 30 incendios (10 por región, uno por decil de superficie).
Severidad del incendio (Google Earth Engine): cálculo de NBR pre/post incendio con Sentinel-2, dNBR por buffer dinámico, vectorización de la cicatriz real (dNBR > 0.27 / > 0.44 según el análisis).
Factores RUSLE (GEE + QGIS): R (CHIRPS), K (FAO + tabla de Wischmeier), LS (ALOS PALSAR, fórmula de Wischmeier y Smith 1978), C (NDVI pre y post incendio, Van der Knijff et al. 2000), P = 1. Multiplicación RUSLE = R × K × LS × C por región.
Asignación de ID por incendio (R + QGIS): join espacial entre la capa de cicatrices vectorizadas (sin clasificar) y los puntos de la base de datos (ID = región + decil de superficie), por vecino más cercano.
Extracción a nivel de píxel (R): extracción de valores de RUSLE y dNBR dentro de cada cicatriz, recorte del 5% extremo, clasificación en quintiles, exportación por incendio.
Análisis (en curso): relación cuantitativa RUSLE–dNBR por quintil; modelos GAM (mgcv) y Random Forest (ranger) con validación espacial cruzada (spatialsample).
Estructura del repositorio
scripts/
  01_gee/      Scripts de Google Earth Engine (JavaScript)
  02_qgis/     Pasos y notas de procesamiento manual en QGIS
  03_r/        Scripts de R (selección de muestra, extracción, análisis)
data/
  processed/   Tablas livianas (BD_30IF.csv, resúmenes por quintil) — NO incluye rasters ni datos crudos
outputs/
  figuras/     Mapas y gráficos generados
  tablas/      Tablas de resultados
docs/
  metodologia.md   Detalle metodológico y limitaciones conocidas
Datos no incluidos en este repositorio

Por su tamaño, no se incluyen los rasters (RUSLE, dNBR, factores individuales) ni la base de datos nacional de incendios cruda. Los scripts documentan las rutas y fuentes usadas (Sentinel-2, CHIRPS, ALOS PALSAR, FAO) para que el pipeline sea reproducible a partir de esas fuentes públicas.

Limitación metodológica conocida

El factor LS (topográfico), calculado con la fórmula de Wischmeier y Smith (1978), se satura en terreno cordillerano extremo: pendientes cercanas al límite de 60% impuesto en el cálculo generan valores de LS ≈ 266, muy por encima de los valores típicos de zonas agrícolas para las que la fórmula fue calibrada originalmente. Esto produce estimaciones de RUSLE en cicatrices de 400–4.539 ton·ha⁻¹·año⁻¹, superiores a los rangos reportados en literatura internacional de erosión post-incendio en cuencas mediterráneas (9–120 ton·ha⁻¹·año⁻¹). Este punto está siendo evaluado con el profesor guía; alternativas en consideración: acotar LS directamente, usar la formulación de McCool et al. (1987) para pendientes pronunciadas, o reportar los valores como un índice relativo de riesgo entre zonas.

Herramientas
R / RStudio: readxl, janitor, dplyr, sf, ggplot2, chilemapas, rnaturalearth, terra, data.table, mgcv, ranger, spatialsample
Google Earth Engine: editor web, JavaScript
QGIS 3.40
