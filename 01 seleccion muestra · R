
# 01 — SELECCIÓN DE LA MUESTRA DE 30 INCENDIOS
# Filtra la base nacional de incendios (2002-2025) y selecciona 30 eventos
# (10 por región: RM, Maule, Biobío) estratificados por decil de superficie.
# Salida: BD_30IF.csv — usado como insumo de los scripts de GEE y del join
# espacial con las cicatrices (02_join_cicatrices_id.R).

 
library(readxl)   # leer el archivo .xlsx original
library(janitor)  # limpiar nombres de columnas (encoding, espacios, mayúsculas)
library(dplyr)    # manipulación de datos (filter, mutate, group_by...)
library(ggplot2)  # histograma de control
library(sf)       # manejo de geometrías de puntos
library(rnaturalearth)  # contorno de Chile para el mapa de control
 

# 1. CARGA Y LIMPIEZA DE NOMBRES DE COLUMNA

# clean_names() resuelve el problema de encoding de tildes del archivo original
# (por ejemplo "Región" -> "regi_a3n") y estandariza mayúsculas/espacios.
Base_datos <- read_xlsx("/ruta/Copy_BD_Incendios2002-2025.xlsx") %>%
  clean_names()

# 2. FILTRO POR REGIÓN DE ESTUDIO

# Nos quedamos solo con incendios en Metropolitana, Maule y Biobío.
BDfiltrada <- Base_datos %>%
  filter(regi_a3n %in% c("Biobío", "Maule", "Metropolitana"))
 
# 3. UMBRAL DE SUPERFICIE (PERCENTIL 99) Y CONTROL VISUAL

# Se usa el percentil 99 de superficie quemada como umbral de "incendio grande"
# — evita trabajar con los miles de incendios pequeños que no son relevantes
# para un análisis de erosión severa.
umbral99 <- quantile(BDfiltrada$superficie_total, 0.99, na.rm = TRUE)
 
# Histograma en escala log para visualizar dónde cae el umbral respecto a la
# distribución completa de tamaños de incendio.
ggplot(BDfiltrada, aes(x = superficie_total)) +
  geom_histogram() +
  scale_x_log10(labels = scales::label_number()) +
  geom_vline(xintercept = umbral99, color = "red") +
  labs(x = "Superficie total (ha)", y = "N° de incendios",
       title = paste0("Umbral percentil 99 = ", round(umbral99, 1), " ha"))
 

# 4. FILTROS DE ELEGIBILIDAD

# Solo incendios sobre el umbral de superficie definido arriba.
BDfiltrada <- BDfiltrada %>% filter(superficie_total >= umbral99)
 
# Se requieren coordenadas operativas válidas para poder ubicar el incendio
# espacialmente (buffers en GEE, join con cicatrices más adelante).
BDfiltrada <- BDfiltrada %>%
  filter(!is.na(coord_operativas_lat) & !is.na(coord_operativas_lon))
 
# Sentinel-2 (base del cálculo de dNBR) tiene cobertura confiable desde 2015 en
# adelante — se descartan incendios anteriores a esa fecha.
BDfiltrada <- BDfiltrada %>% filter(year_inicio >= 2015)
 
nrow(BDfiltrada)  # tamaño del universo elegible antes del muestreo estratificado

# 5. MAPA DE CONTROL — DISTRIBUCIÓN ESPACIAL DEL UNIVERSO ELEGIBLE

BD_sf <- BDfiltrada %>%
  st_as_sf(coords = c("coord_operativas_lon", "coord_operativas_lat"), crs = 4326)
 
Chile <- ne_countries(country = "Chile", returnclass = "sf")
 
ggplot(BD_sf) +
  geom_sf(data = Chile) +
  geom_sf() +
  coord_sf(xlim = c(-74, -70), ylim = c(-38, -33)) +
  labs(title = "Incendios elegibles (pre-muestreo)")
 

# 6. MUESTREO ESTRATIFICADO: 10 INCENDIOS POR REGIÓN, 1 POR DECIL DE SUPERFICIE

# ntile(superficie_total, 10) divide los incendios de cada región en 10 grupos
# de tamaño creciente (deciles); slice_sample(n = 1) elige un incendio al azar
# dentro de cada decil. Esto asegura representar tanto incendios "grandes
# dentro de los grandes" como los más chicos del universo ya filtrado.
set.seed(42)  # reproducibilidad del muestreo aleatorio
 
BD_metropolitana <- BDfiltrada %>%
  filter(regi_a3n == "Metropolitana") %>%
  mutate(Deciles = ntile(superficie_total, 10)) %>%
  group_by(Deciles) %>%
  slice_sample(n = 1)
 
BD_maule <- BDfiltrada %>%
  filter(regi_a3n == "Maule") %>%
  mutate(Deciles = ntile(superficie_total, 10)) %>%
  group_by(Deciles) %>%
  slice_sample(n = 1)
 
BD_biobio <- BDfiltrada %>%
  filter(grepl("Bio", regi_a3n)) %>%  # grepl por si el nombre exacto varía (ej. "Biobío" vs "Bio Bio")
  mutate(Deciles = ntile(superficie_total, 10)) %>%
  group_by(Deciles) %>%
  slice_sample(n = 1)
 
# Unimos los tres grupos regionales en la muestra final de 30 incendios.
BD_30 <- bind_rows(BD_metropolitana, BD_maule, BD_biobio)
 
nrow(BD_30)  # debería ser 30 (3 regiones x 10 deciles)
 

# 7. MAPA DE CONTROL — LOS 30 INCENDIOS SELECCIONADOS

BD_30_sf <- BD_30 %>%
  st_as_sf(coords = c("coord_operativas_lon", "coord_operativas_lat"), crs = 4326)
 
ggplot() +
  geom_sf(data = Chile) +
  geom_sf(data = BD_30_sf, color = "red") +
  coord_sf(xlim = c(-74, -70), ylim = c(-38, -33)) +
  labs(title = "Muestra final: 30 incendios (10 por región)")
 
# 8. EXPORTAR LA MUESTRA FINAL
# -----------------------------------------------------------------------------
# Este CSV es el insumo que se sube como asset ("table") a Google Earth Engine
# en todos los scripts de la carpeta 01_gee/.
write.csv(BD_30, "/ruta/BD_30IF.csv", row.names = FALSE)
