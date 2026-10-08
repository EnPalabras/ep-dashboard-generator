---
description: Crear o cambiar un dashboard (se publica en la base, sin commit ni deploy)
---

Vas a crear o cambiar un dashboard para el equipo de En Palabras. Hablá en castellano y, antes de cada acción que modifique algo, decile al usuario en una frase qué vas a hacer y por qué.

## Antes de empezar

1. **¿Qué tiene que mostrar?** Pregunta de respuesta libre: **no** uses `AskUserQuestion` con opciones acá. Si la respuesta es vaga, repreguntá en texto.
2. **¿Cómo se llama?** Podés ofrecer 2-3 títulos cortos. De ahí sale el `slug` en kebab-case.
3. Leé `docs/conector/dashboards.md` (reglas del HTML) y `docs/conector/base.md` (qué hay en la base y cómo se define una venta). Antes de escribir gráficos, cargá el skill `dataviz`.

## Pasos

1. Si es un cambio, bajalo: `bun run dashboard pull <slug>`. Si es nuevo, creá `dashboards/<slug>.html` y `dashboards/<slug>.sql`. Para copiar estructura: `bun run dashboard pull trafico-landing`.
2. Escribí las queries (`-- @query <nombre>`, tablas de v2) y probalas con `bun run dashboard check <slug> [from=.. to=..]`. Mostrale al usuario los números clave antes de seguir.
3. Escribí el HTML: pide los datos a `/api/q/<slug>/<query>`; nada de datos embebidos.
4. Avisale y publicá: `bun run dashboard publish <slug> "<título>" "<descripción>" "<qué cambió>"`. Queda al instante en `https://ep-dashboard-generator-production.up.railway.app/d/<slug>`.
   - Si dice que el dashboard cambió en el medio, alguien publicó otra versión: hacé `pull` de nuevo, aplicá los cambios encima y volvé a publicar. No lo fuerces.
5. No hay que commitear nada: `dashboards/` está en `.gitignore`.
