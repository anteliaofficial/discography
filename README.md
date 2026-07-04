# The Antelia™ Experience — App dinámica (catálogo en vivo)

Esta versión lee tu carpeta de Google Drive **en tiempo real** cada vez que alguien
abre la app. Si subes una canción nueva a una carpeta de álbum existente, o creas
un álbum nuevo dentro de una categoría existente, aparece sola — sin tocar código.

## Paso 1 — Genera tu API Key (una sola vez)

1. Ve a [console.cloud.google.com](https://console.cloud.google.com) con la cuenta
   `anteliaofficial@gmail.com`.
2. Crea un proyecto (ej. "Antelia Web").
3. **APIs y servicios → Biblioteca** → busca **"Google Drive API"** → **Habilitar**.
4. **APIs y servicios → Credenciales → Crear credenciales → Clave de API**.
5. Haz clic en la clave recién creada para restringirla:
   - **Restricciones de la aplicación** → "Referentes HTTP" → agrega
     `tu-usuario.github.io/*` (y `localhost/*` si vas a probar en tu compu antes).
   - **Restricciones de API** → "Restringir clave" → marca solo **Google Drive API**.
6. Copia la clave (empieza con `AIza...`).

## Paso 2 — Pégala en el código

Abre `index.html`, busca esta línea cerca del inicio del `<script>`:

```js
const API_KEY = 'PEGA_AQUI_TU_API_KEY';
```

Reemplaza el texto entre comillas por tu clave real.

## Paso 3 — Sube a GitHub Pages

Igual que antes: sube todos los archivos de esta carpeta a la raíz de tu
repositorio, activa GitHub Pages en Settings → Pages, y listo.

## Cómo se construye el catálogo automáticamente

La app recorre tu carpeta raíz así:

```
Carpeta raíz
 └─ Proyecto (Antelia, Arken, ARIA, Mauro Fuentes, Manto)
     └─ Categoría (The Albums, The Singles, The Extended...)
         └─ Álbum → "[2026.04.01] Abstract"
             ├─ Cover Art/ (o una imagen suelta)
             └─ Pistas → "01. Primores.mp3"
```

Para que esto siga funcionando sin que tengas que tocar nada, **respeta el mismo
formato de nombres** que ya usas:
- Álbumes: `[AAAA.MM.DD] Título del álbum`
- Pistas: `NN. Título de la canción.mp3`
- Portada: una carpeta llamada exactamente `Cover Art` con una imagen adentro,
  o una imagen suelta directamente en la carpeta del álbum.

Si el nombre no sigue ese formato, la app igual lo muestra, solo que sin fecha
separada o sin número de pista ordenado.

## Caché (para no golpear la API en cada visita)

La app guarda el catálogo en el navegador de cada visitante por **1 hora**
(`localStorage`). Esto significa que si subes una canción nueva, alguien que ya
visitó la app en la última hora no la verá hasta que pase ese tiempo o toque el
botón **"Actualizar catálogo"** arriba a la derecha. Puedes bajar ese tiempo
editando `CACHE_TTL_MS` en el código si prefieres que se actualice más seguido
(a costa de más llamadas a la API de Google).

## Límites a tener en cuenta

- La API de Google Drive tiene una cuota gratuita amplia, pero no infinita. Con
  la caché de 1 hora, el consumo debería mantenerse bajo incluso con tráfico
  moderado.
- El streaming de audio sigue usando enlaces directos de Drive
  (`drive.google.com/uc?export=download`), con el mismo riesgo ya conocido de
  límites de descarga si un archivo se reproduce muchísimo en poco tiempo.
- Si algún día el catálogo crece mucho (cientos de álbumes), esta app tardará
  más en cargar la primera vez, porque recorre carpeta por carpeta. En ese caso
  conviene pasar a un catálogo pre-generado por un script periódico en vez de
  construirlo en vivo en el navegador de cada visitante.
