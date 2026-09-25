# Erosión post-incendio en Chile central (RM, Maule, Biobío)

IPRE (Investigación de Pregrado) — Ingeniería Forestal, Pontificia Universidad Católica de Chile.
Profesor guía: Horacio Gilabert.

## Objetivo

Establecer relaciones empíricas entre la severidad de incendios forestales (dNBR) y el potencial
de erosión del suelo (RUSLE), a partir de 30 incendios ocurridos entre 2015 y 2025 en las regiones
Metropolitana, Maule y Biobío, más un caso de estudio detallado (incendio de San Carlos de
Apoquindo, 29-12-2025).

## Pipeline general

1. **Selección de la muestra** (R): filtrado de la base nacional de incendios (2002-2025) por
   región, superficie (≥ percentil 99), año (≥2015) y disponibilidad de coordenadas. Selección
   estratificada de 30 incendios (10 por región, uno por decil de superficie).
2. **Severidad del incendio** (Google Earth Engine): cálculo de NBR pre/post incendio con
   Sentinel-2, dNBR por buffer dinámico, vectorización de la cicatriz real (dNBR > 0.27 / > 0.44
   según el análisis).
3. **Factores RUSLE** (GEE + QGIS): R (CHIRPS), K (FAO + tabla de Wischmeier), LS (ALOS PALSAR,
   fórmula de Wischmeier y Smith 1978), C (NDVI pre y post incendio, Van der Knijff et al. 2000),
   P = 1. Multiplicación RUSLE = R × K × LS × C por región.
4. **Asignación de ID por incendio** (R + QGIS): join espacial entre la capa de cicatrices
   vectorizadas (sin clasificar) y los puntos de la base de datos (ID = región + decil de
   superficie), por vecino más cercano.
5. **Extracción a nivel de píxel** (R): extracción de valores de RUSLE y dNBR dentro de cada
   cicatriz, recorte del 5% extremo, clasificación en quintiles, exportación por incendio.

## Estructura del repositorio

```
scripts/
  01_gee/      Scripts de Google Earth Engine (JavaScript)
  02_qgis/     Pasos y notas de procesamiento manual en QGIS
  03_r/        Scripts de R (selección de muestra, extracción, análisis)
```

## Datos no incluidos en este repositorio

Por su tamaño, **no se incluyen los rasters** (RUSLE, dNBR, factores individuales) ni la base de
datos nacional de incendios cruda. Los scripts documentan las rutas y fuentes usadas
(Sentinel-2, CHIRPS, ALOS PALSAR, FAO) para que el pipeline sea reproducible a partir de esas
fuentes públicas.

## Resultados

### Severidad del incendio (dNBR)

Mosaico de dNBR calculado a partir de imágenes Sentinel-2 pre y post incendio, para los 30
eventos de la muestra. La clasificación de severidad sigue los umbrales USGS (sin cambio,
baja, moderada-baja, moderada-alta, alta).

<img width="1755" height="1240" alt="Mapa erosion_severidad_page-0001" src="https://github.com/user-attachments/assets/720a8d2b-5c49-4caa-a540-c48b26fd9d4b" />

### Potencial de erosión (RUSLE)

Raster de RUSLE post-incendio (R × K × LS × C), recortado a las cicatrices de severidad
moderada-alta y alta (dNBR > 0.44).

### Distribución espacial por quintil de erosión

Clasificación de los píxeles de RUSLE (recortado 5% extremo) en quintiles, sobre las tres
regiones de estudio. Ver `scripts/03_r/05_analisis_exploratorio_quintiles.R`.

<img width="1024" height="663" alt="1790276487315-33696e0c-7c97-4de5-a625-448493f5fba11_1" src="https://github.com/user-attachments/assets/93db705d-1fe8-4373-a1eb-d634b37ce7a8" />

### Relación entre severidad y erosión potencial

Distribución de dNBR por quintil de RUSLE — la mediana de severidad aumenta de forma
consistente desde Q1 hasta Q5.

<img width="1024" height="663" alt="1790276523993-11524cf2-4d12-42a6-8bc6-40f1d27c9435_1" src="https://github.com/user-attachments/assets/e5b7a4da-f1cf-4644-b884-98f696ca3b8e" />



| Quintil | Rango RUSLE (ton·ha⁻¹·año⁻¹) | dNBR medio |
|---|---|---|
| Q1 (muy bajo) | 52.9 – 274.5 | ≈0.40 |
| Q2 (bajo) | 274.5 – 615.4 | ≈0.46 |
| Q3 (medio) | 615.4 – 1065.0 | ≈0.53 |
| Q4 (alto) | 1065.0 – 1829.3 | ≈0.58 |
| Q5 (muy alto) | 1829.3 – 4539.1 | ≈0.61 |


## Limitación metodológica conocida

El factor LS (topográfico), calculado con la fórmula de Wischmeier y Smith (1978), se satura en
terreno cordillerano extremo: pendientes cercanas al límite de 60% impuesto en el cálculo generan
valores de LS ≈ 266, muy por encima de los valores típicos de zonas agrícolas para las que la
fórmula fue calibrada originalmente. Esto produce estimaciones de RUSLE en cicatrices de
400–4.539 ton·ha⁻¹·año⁻¹, superiores a los rangos reportados en literatura internacional de
erosión post-incendio en cuencas mediterráneas (9–120 ton·ha⁻¹·año⁻¹). 

## Herramientas

- **R / RStudio**: `readxl`, `janitor`, `dplyr`, `sf`, `ggplot2`, `chilemapas`, `rnaturalearth`,
  `terra`, `data.table`, `mgcv`, `ranger`, `spatialsample`
- **Google Earth Engine**: editor web, JavaScript
- **QGIS 3.40**
