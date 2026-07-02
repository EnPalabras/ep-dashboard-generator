---
description: Crear un dashboard nuevo (HTML + registro en la base)
---

Vas a crear un dashboard nuevo para el equipo de En Palabras. Seguí estos pasos y **antes de cada acción, decile al usuario en castellano qué vas a hacer y por qué**. No ejecutes nada sin avisar primero.

## Información que necesitás

Si el usuario no te lo dio todo, preguntale (en castellano, una pregunta a la vez):

1. **¿Qué tiene que mostrar el dashboard?** (descripción funcional)
   - **IMPORTANTE:** esta pregunta es siempre de respuesta libre. **NO uses `AskUserQuestion` con opciones predefinidas acá** — no le sugieras al usuario qué dashboard armar. Esperá a que escriba lo que necesita con sus propias palabras. Si la respuesta es muy vaga, repreguntá con texto plano (no con menú).
2. **¿Cómo se llama?** (título visible, ej: "Gasto Semanal de Meta") — acá sí podés ofrecer 2-3 opciones cortas si el usuario no propuso un título.
3. **¿Quién lo pide?** (nombre del autor — guardalo en memoria si no lo sabés)

De ahí derivás un **slug** corto en kebab-case (ej: `gasto-semanal-meta`).

## Pasos a ejecutar

1. **Decile al usuario**: "Voy a crear `dashboards/<slug>.html` y sus queries en `dashboards/<slug>.sql`, con [resumen de lo que va a mostrar y de qué datos toma]."
   - Mirá `@CLAUDE.md` — sección "Base de datos" (qué hay: ventas en `public`, GA4/funnel/IG en `analytics`) y "Named queries".
   - Referencia de estructura: `@dashboards/ventas-reales.html` + `@dashboards/ventas-reales.sql` (HTML auto-contenido + SQL co-locada con marcadores `-- @query <nombre>`).
   - Las queries van **co-locadas** en `dashboards/<slug>.sql`; el HTML las llama vía `/api/q/<slug>/<query>`.
   - **Antes de escribir gráficos, cargá el skill `dataviz`.** Paleta de la casa: violeta EP `#774293`.

2. **Decile al usuario**: "Ahora lo registro con `bun run dashboard:register <slug> "<title>" "<author>" "<description>"`."
   - Ejecutá ese comando (INSERT/UPDATE en `analytics.dashboards`). **No hagas SQL crudo a mano.**

3. **Decile al usuario**: "Voy a commitear y pushear los archivos nuevos al repo."
   - Corré `git status` para confirmar qué se modificó.
   - Stageá **sólo** los archivos del dashboard (`dashboards/<slug>.html` y `dashboards/<slug>.sql`). Nada de `git add -A`.
   - Commiteá con un mensaje corto tipo `feat(dashboard): <slug> — <descripción de una línea>`.
   - Pusheá a `main` con `git push`.
   - Si el push falla, mostrale el error al usuario y paralo ahí — no intentes fix con `--force`.

4. **Decile al usuario**: "Listo. Levantá el server con `bun run dev` y abrí http://localhost:3000 para verlo."
   - Si el server ya está corriendo, recordale solamente que refresque.

## Reglas

- Hablá siempre en castellano con el usuario.
- Antes de cada tool call que modifique algo (Write, Bash de inserción, etc.), explicá en una frase qué vas a hacer.
- Si el dashboard necesita datos que no están en los endpoints actuales, **paralo y avisale al usuario** — no inventes endpoints ni toques el server sin pedir permiso explícito.
