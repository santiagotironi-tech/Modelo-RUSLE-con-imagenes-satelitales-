
# 05 — ANÁLISIS EXPLORATORIO: QUINTILES DE RUSLE Y RELACIÓN CON dNBR
#
# Este script es independiente de 03 y 04: no exporta un CSV por incendio,
# sino que arma una tabla combinada RUSLE + dNBR a nivel de píxel (recortada
# al 5%), la clasifica en quintiles, y genera las salidas usadas para
# presentar avances: boxplot de severidad por quintil, tabla de rangos y
# resumen, y un mapa de la distribución espacial de los quintiles sobre
# las tres regiones de estudio.


library(terra)
library(sf)
library(dplyr)
library(ggplot2)
library(chilemapas)


# 1. CARGAR CICATRICES Y EXTRAER RUSLE POR REGIÓN (sin fusionar rasters)

cicatrices <- st_read("/ruta/cicatrices_con_id.gpkg")

rutas_rusle <- list(
  RM     = "/ruta/RUSLE_RM.tif",
  Maule  = "/ruta/RUSLE_MAULE.tif",
  Biobio = "/ruta/RUSLE_BIOBIO.tif"
)

lista_extracciones <- list()

for (region in names(rutas_rusle)) {
  r <- rast(rutas_rusle[[region]])
  cicatrices_r <- st_transform(cicatrices, crs = crs(r))

  ext_temp <- extract(r, vect(cicatrices_r), cells = TRUE, xy = TRUE)
  names(ext_temp)[2] <- "RUSLE"
  ext_temp <- ext_temp %>% filter(!is.na(RUSLE))

  lista_extracciones[[region]] <- ext_temp
  rm(r, cicatrices_r, ext_temp)
  gc()
}

extraccion <- bind_rows(lista_extracciones)
rm(lista_extracciones)
gc()



p05 <- quantile(extraccion$RUSLE, 0.05, na.rm = TRUE)
p95 <- quantile(extraccion$RUSLE, 0.95, na.rm = TRUE)

extraccion_trim <- extraccion %>% filter(RUSLE >= p05, RUSLE <= p95)
rm(extraccion)
gc()

# Los quintiles se calculan sobre TODOS los píxeles de los 30 incendios en
# conjunto (clasificación global), no por separado dentro de cada incendio,
# para que sean comparables entre sí.
quintil_breaks <- quantile(extraccion_trim$RUSLE, probs = seq(0, 1, 0.2), na.rm = TRUE)

extraccion_trim <- extraccion_trim %>%
  mutate(quintil = cut(RUSLE, breaks = quintil_breaks,
                        include.lowest = TRUE,
                        labels = c("Q1 (muy bajo)", "Q2 (bajo)", "Q3 (medio)",
                                   "Q4 (alto)", "Q5 (muy alto)")))


# 3. EXTRAER dNBR EN LOS MISMOS PÍXELES (alineado al grid de RUSLE)

# project() reproyecta y remuestrea dNBR a la resolución/CRS de RUSLE (30m,
# EPSG:32719) para poder muestrear ambos rasters en las mismas coordenadas.
dNBR_mosaico <- rast("/ruta/cicatriz_dNBR_30IF.tif")
dnbr_alineado <- project(dNBR_mosaico, rast(rutas_rusle$RM), method = "bilinear")

resultado_extract <- extract(dnbr_alineado, extraccion_trim[, c("x", "y")])
extraccion_trim$dNBR <- resultado_extract[, 2]  # la columna 1 es el ID de fila, no el valor

rm(dNBR_mosaico, dnbr_alineado, resultado_extract)
gc()

summary(extraccion_trim$dNBR)


# 4. TABLA RESUMEN: RANGOS DE QUINTIL + ESTADÍSTICAS DE dNBR y RUSLE

tabla_quintiles <- data.frame(
  Quintil   = c("Q1 (muy bajo)", "Q2 (bajo)", "Q3 (medio)", "Q4 (alto)", "Q5 (muy alto)"),
  Rango_min = round(quintil_breaks[1:5], 1),
  Rango_max = round(quintil_breaks[2:6], 1)
)

resumen_quintiles <- extraccion_trim %>%
  group_by(quintil) %>%
  summarise(
    n_pixeles   = n(),
    RUSLE_medio = mean(RUSLE, na.rm = TRUE),
    RUSLE_sd    = sd(RUSLE, na.rm = TRUE),
    dNBR_medio  = mean(dNBR, na.rm = TRUE),
    dNBR_sd     = sd(dNBR, na.rm = TRUE),
    .groups     = "drop"
  )

tabla_completa <- tabla_quintiles %>%
  left_join(resumen_quintiles, by = c("Quintil" = "quintil"))

write.csv(tabla_completa, "/ruta/tabla_quintiles_resumen.csv", row.names = FALSE)


# 5. BOXPLOT: SEVERIDAD (dNBR) POR QUINTIL DE EROSIÓN POTENCIAL

ggplot(extraccion_trim, aes(x = quintil, y = dNBR, fill = quintil)) +
  geom_boxplot() +
  scale_fill_manual(values = c(
    "Q1 (muy bajo)" = "#FFFFB2", "Q2 (bajo)" = "#FECC5C",
    "Q3 (medio)" = "#FD8D3C", "Q4 (alto)" = "#F03B20", "Q5 (muy alto)" = "#BD0026"
  )) +
  labs(title = "Severidad del incendio (dNBR) por quintil de erosión potencial",
       x = "Quintil de RUSLE", y = "dNBR") +
  theme_minimal() +
  theme(legend.position = "none")

ggsave("/ruta/boxplot_dNBR_por_quintil.png", width = 9, height = 6, dpi = 200)


# 6. MAPA: DISTRIBUCIÓN ESPACIAL DE LOS QUINTILES SOBRE RM, MAULE Y BIOBÍO

# 6.1 Rasterizar los píxeles clasificados usando la misma grilla que RUSLE
pts_trim <- vect(extraccion_trim, geom = c("x", "y"), crs = crs(rast(rutas_rusle$RM)))
pts_trim$quintil_num <- as.numeric(factor(pts_trim$quintil,
  levels = c("Q1 (muy bajo)", "Q2 (bajo)", "Q3 (medio)", "Q4 (alto)", "Q5 (muy alto)")))

quintiles_raster <- rasterize(pts_trim, rast(rutas_rusle$RM), field = "quintil_num")

# 6.2 Reproyectar a WGS84 y reducir resolución (fact = 10) — a escala regional
# no se necesita el detalle de 30m, y esto evita saturar ggplot con millones
# de celdas.
quintiles_wgs84 <- project(quintiles_raster, "EPSG:4326", method = "near")
quintiles_agregado <- aggregate(quintiles_wgs84, fact = 10, fun = "modal", na.rm = TRUE)

quintiles_df <- as.data.frame(quintiles_agregado, xy = TRUE, na.rm = TRUE)
names(quintiles_df)[3] <- "quintil"
quintiles_df$quintil <- factor(quintiles_df$quintil, labels = c("Q1", "Q2", "Q3", "Q4", "Q5"))

# 6.3 Mapa base de regiones de Chile (paquete chilemapas)
regiones_chile <- mapa_comunas %>%
  left_join(codigos_territoriales %>% distinct(codigo_region, nombre_region),
            by = "codigo_region") %>%
  group_by(codigo_region, nombre_region) %>%
  summarise(geometry = st_union(geometry), .groups = "drop") %>%
  st_as_sf()

# Ajustar estos 3 nombres si `unique(regiones_chile$nombre_region)` muestra
# una variante distinta (chilemapas no usa tildes en algunos releases).
regiones_interes <- regiones_chile %>%
  filter(nombre_region %in% c("Metropolitana de Santiago", "Maule", "Biobio"))

bbox_zoom <- st_bbox(regiones_interes)
margen <- 0.3  # grados de margen extra alrededor del zoom

# 6.4 Mapa final
ggplot() +
  geom_sf(data = regiones_chile, fill = "grey95", color = "grey60", linewidth = 0.3) +
  geom_tile(data = quintiles_df, aes(x = x, y = y, fill = quintil)) +
  geom_sf(data = regiones_interes, fill = NA, color = "black", linewidth = 0.6) +
  scale_fill_brewer(palette = "YlOrRd", na.translate = FALSE) +
  coord_sf(xlim = c(bbox_zoom["xmin"] - margen, bbox_zoom["xmax"] + margen),
           ylim = c(bbox_zoom["ymin"] - margen, bbox_zoom["ymax"] + margen)) +
  labs(title = "Quintiles de erosión potencial (RUSLE post-incendio)",
       subtitle = "Regiones Metropolitana, Maule y Biobío",
       fill = "Quintil", x = "Longitud", y = "Latitud") +
  theme_minimal()

ggsave("/ruta/mapa_quintiles_zoom.png", width = 10, height = 12, dpi = 200)
