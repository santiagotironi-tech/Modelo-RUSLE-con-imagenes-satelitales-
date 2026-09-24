
# 02 — ASIGNAR ID_incendio A LA CAPA DE CICATRICES
#
# Problema que resuelve: la capa de cicatrices vectorizadas a partir del
# raster dNBR (umbral > 0.27, generada en QGIS con Raster Calculator +
# Polygonize) NO tiene ningún identificador — es solo la forma geométrica de
# cada área quemada, sin saber a qué incendio de BD_30IF.csv corresponde.
#
# Solución: unir espacialmente cada polígono con el punto de coordenadas más
# cercano de BD_30IF (que sí tiene ID_incendio = región + decil de
# superficie). Esto funciona porque cada punto de ignición está, por
# construcción, dentro o muy cerca de su propia cicatriz.
#
# Salida: cicatrices_con_id.gpkg — insumo de 03, 04 y 05.


library(sf)
library(dplyr)


# 1. DESACTIVAR EL MOTOR s2 ANTES DE CUALQUIER OPERACIÓN GEOMÉTRICA

# El motor esférico (s2), activado por defecto en sf, es más estricto que el
# motor plano (GEOS) y falla con geometrías inválidas que resultan de la
# vectorización de raster (vértices duplicados, loops que se autointersectan).
# GEOS es más tolerante y es el mismo motor que usa QGIS internamente.
sf_use_s2(FALSE)


# 2. CARGAR Y REPARAR LA CAPA DE CICATRICES (SIN ID)

Cicatrices <- st_read("/ruta/VECTORINCENDIOS.gpkg") %>%
  filter(Vector.dNBR.0.27 == 1) %>%  # se descartan los polígonos "no quemado" (valor 0)
  st_make_valid()                     # repara geometrías inválidas (motor GEOS)


# 3. CARGAR LA CAPA DE PUNTOS CON ID_incendio

# BD_30IF.gpkg es la muestra de 30 incendios (01_seleccion_muestra.R) con el
# campo ID_incendios ya construido en QGIS (Field Calculator: región + decil).
ID <- st_read("/ruta/BD_30IF.gpkg")
ID <- st_transform(ID, crs = st_crs(Cicatrices))  # mismo CRS que las cicatrices


# 4. JOIN ESPACIAL POR VECINO MÁS CERCANO

# A cada polígono de cicatriz se le copia el ID_incendios del punto más
# cercano. Se usa "nearest" en vez de "intersects" porque la coordenada
# operativa reportada puede no caer exactamente dentro del polígono
# vectorizado.
cicatrices <- st_join(Cicatrices, ID["ID_incendios"], join = st_nearest_feature)

sf_use_s2(TRUE)  # reactivar el motor s2 para el resto del análisis


# 5. VERIFICACIÓN — debe dar 0 y 30 respectivamente

stopifnot(sum(is.na(cicatrices$ID_incendios)) == 0)
stopifnot(length(unique(cicatrices$ID_incendios)) == 30)


# 6. GUARDAR LA CAPA YA UNIDA

# Este archivo es el que leen directamente los scripts 03, 04 y 05 — evita
# recalcular el join cada vez que se corre una extracción distinta.
st_write(cicatrices, "/ruta/cicatrices_con_id.gpkg", delete_dsn = TRUE)
