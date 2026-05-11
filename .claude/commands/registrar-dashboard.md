---
description: Registrar en la base un dashboard que ya existe como archivo HTML
---

El usuario quiere agregar a la base un dashboard que **ya tiene el HTML** en `dashboards/`. Vos sólo corrés el script de registro — no tocás el HTML.

## Pasos

1. Si no lo sabés, preguntale al usuario:
   - **slug** (nombre del archivo sin `.html`)
   - **título** visible
   - **autor**
   - **descripción** corta

2. **Decile al usuario**: "Voy a correr `bun run dashboard:register <slug> "<title>" "<author>" "<description>"`. Eso hace un INSERT en la tabla `dashboards` (o UPDATE si el slug ya existe)."

3. Ejecutá el comando.

4. Confirmale el resultado al usuario.

## Reglas

- Hablá en castellano.
- **No hagas SQL crudo.** El único comando válido para registrar es `bun run dashboard:register`.
- Si el archivo HTML no existe en `dashboards/`, avisale al usuario antes de registrar.
