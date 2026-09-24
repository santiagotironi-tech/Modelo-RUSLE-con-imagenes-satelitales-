
# 03 — EXTRACCIÓN DE PÍXELES DE RUSLE POR INCENDIO
#
# Objetivo: para cada uno de los 30 incendios, extraer TODOS los valores de
# píxel de RUSLE (post-incendio) dentro de su cicatriz, recortar el 5%
# extremo de la distribución (ruido de píxeles atípicos) y exportar un CSV
# independiente por incendio.
#
# Nota de diseño: los 3 rasters RUSLE (uno por región) se procesan uno a la
# vez, en vez de fusionarlos primero con merge(). Fusionar los 3 rasters en
# un solo mosaico antes de extraer duplica el uso de memoria sin necesidad
# (cada incendio solo intersecta una región) y fue la causa de varios
# cuelgues de la sesión de R durante el desarrollo de este pipeline.


library(terra)
library(sf)
library(dplyr)
library(data.table)  # fwrite() es mucho más rápido que write.csv() para
                      # datasets de cientos de miles de filas


# 1. CARGAR LA CAPA DE CICATRICES YA CON ID (ver 02_join_cicatrices_id.R)

cicatrices <- st_read("/ruta/cicatrices_con_id.gpkg")


# 2. EXTRAER RUSLE REGIÓN POR REGIÓN

rutas_rusle <- list(
  RM     = "/ruta/RUSLE_RM.tif",
  Maule  = "/ruta/RUSLE_MAULE.tif",
  Biobio = "/ruta/RUSLE_BIOBIO.tif"
)

lista_extracciones <- list()

for (region in names(rutas_rusle)) {

  r <- rast(rutas_rusle[[region]])                       # cargar solo el raster de esta región
  cicatrices_r <- st_transform(cicatrices, crs = crs(r))  # alinear CRS al del raster

  # extract(cells = TRUE, xy = TRUE): además del valor, guarda el número de
  # celda y las coordenadas de cada píxel — útiles para trazabilidad espacial.
  ext_temp <- extract(r, vect(cicatrices_r), cells = TRUE, xy = TRUE)
  names(ext_temp)[2] <- "RUSLE"

  # extract() devuelve un ID de fila secuencial (columna "ID"), NO el ID del
  # incendio — hay que mapearlo explícitamente contra la capa de cicatrices.
  ext_temp$ID_incendio <- cicatrices_r$ID_incendios[ext_temp$ID]

  ext_temp <- ext_temp %>% filter(!is.na(RUSLE))  # descarta píxeles fuera del raster regional

  lista_extracciones[[region]] <- ext_temp

  rm(r, cicatrices_r, ext_temp)  # liberar memoria antes de pasar a la siguiente región
  gc()
}

extraccion <- bind_rows(lista_extracciones)
rm(lista_extracciones)
gc()

nrow(extraccion)
length(unique(extraccion$ID_incendio))  # debería ser 30


# 3. RECORTAR EL 5% EXTREMO EN AMBAS COLAS

# Elimina el 5% de valores más bajos y más altos para reducir el efecto de
# píxeles atípicos (por ejemplo, zonas puntuales de pendiente extrema donde
# el factor LS se satura — ver docs/metodologia.md).
p05 <- quantile(extraccion$RUSLE, 0.05, na.rm = TRUE)
p95 <- quantile(extraccion$RUSLE, 0.95, na.rm = TRUE)

extraccion_trim <- extraccion %>%
  filter(RUSLE >= p05, RUSLE <= p95)

rm(extraccion)
gc()

nrow(extraccion_trim)


# 4. EXPORTAR UN CSV POR INCENDIO

# Se usa un loop for() en vez de group_split() + purrr::walk2(): group_split()
# crea 30 copias del dataframe en memoria simultáneamente antes de escribir
# nada, lo cual con ~2.7M filas totales agota la RAM disponible en equipos
# con poca memoria. El loop procesa y libera un incendio a la vez.
dir.create("/ruta/pixeles_RUSLE_por_incendio", showWarnings = FALSE)

for (id in unique(extraccion_trim$ID_incendio)) {
  datos_id <- extraccion_trim %>% filter(ID_incendio == id)

  fwrite(datos_id, file = paste0("/ruta/pixeles_RUSLE_por_incendio/", id, ".csv"))

  rm(datos_id)
  gc()
}
