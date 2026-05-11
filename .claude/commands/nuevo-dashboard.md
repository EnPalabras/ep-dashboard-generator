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

1. **Decile al usuario**: "Voy a crear el archivo `dashboards/<slug>.html` con [resumen de lo que va a mostrar y de qué endpoint de la API toma los datos]."
   - Mirá `@CLAUDE.md` para los endpoints disponibles y las clases CSS.
   - Mirá `@dashboards/example-meta-overview.html` como referencia de estructura.
   - Creá el archivo HTML auto-contenido (sin imports, sin build step).

2. **Decile al usuario**: "Ahora lo registro en la base con `bun run dashboard:register <slug> "<title>" "<author>" "<description>"`."
   - Ejecutá ese comando. Ese comando hace un INSERT en la tabla `dashboards` (o UPDATE si ya existe el slug).
   - **No hagas SQL crudo a mano.** Siempre usá el script.

3. **Decile al usuario**: "Listo. Levantá el server con `bun run dev` y abrí http://localhost:3000 para verlo."
   - Si el server ya está corriendo, recordale solamente que refresque.

## Reglas

- Hablá siempre en castellano con el usuario.
- Antes de cada tool call que modifique algo (Write, Bash de inserción, etc.), explicá en una frase qué vas a hacer.
- Si el dashboard necesita datos que no están en los endpoints actuales, **paralo y avisale al usuario** — no inventes endpoints ni toques el server sin pedir permiso explícito.
