
# 04 — EXTRACCIÓN DE PÍXELES DE dNBR POR INCENDIO
#
# Mismo objetivo y misma lógica que 03_extraccion_pixeles_RUSLE.R, aplicado
# al raster de severidad (dNBR) en vez de RUSLE. A diferencia de RUSLE, dNBR
# viene en un único mosaico (no está separado por región), por lo que no se
# necesita el loop por región.


library(terra)
library(sf)
library(dplyr)
library(data.table)

# 1. CARGAR CICATRICES CON ID Y EL RASTER DE dNBR

cicatrices <- st_read("/ruta/cicatrices_con_id.gpkg")

dNBR_mosaico <- rast("/ruta/cicatriz_dNBR_30IF.tif")
cicatrices <- st_transform(cicatrices, crs = crs(dNBR_mosaico))


# 2. EXTRAER dNBR DENTRO DE LAS CICATRICES

extraccion <- extract(dNBR_mosaico, vect(cicatrices), cells = TRUE, xy = TRUE)
names(extraccion)[2] <- "dNBR"
extraccion$ID_incendio <- cicatrices$ID_incendios[extraccion$ID]

extraccion <- extraccion %>% filter(!is.na(dNBR))

rm(dNBR_mosaico)
gc()

nrow(extraccion)
length(unique(extraccion$ID_incendio))  # debería ser 30


# 3. RECORTAR EL 5% EXTREMO EN AMBAS COLAS

p05 <- quantile(extraccion$dNBR, 0.05, na.rm = TRUE)
p95 <- quantile(extraccion$dNBR, 0.95, na.rm = TRUE)

extraccion_trim <- extraccion %>%
  filter(dNBR >= p05, dNBR <= p95)

rm(extraccion)
gc()

nrow(extraccion_trim)


# 4. EXPORTAR UN CSV POR INCENDIO

dir.create("/ruta/pixeles_dNBR_por_incendio", showWarnings = FALSE)

for (id in unique(extraccion_trim$ID_incendio)) {
  datos_id <- extraccion_trim %>% filter(ID_incendio == id)

  fwrite(datos_id, file = paste0("/ruta/pixeles_dNBR_por_incendio/", id, ".csv"))

  rm(datos_id)
  gc()
}
