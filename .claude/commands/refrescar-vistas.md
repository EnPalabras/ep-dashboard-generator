---
description: Refrescar las materialized views de la base (mv_meta_daily, etc.)
---

El usuario quiere que las materialized views vuelvan a tener datos frescos (después de un `bun run batch`, por ejemplo).

## Pasos

1. **Decile al usuario**: "Voy a correr `bun run db:refresh-views`. Eso refresca las materialized views (`mv_meta_daily`, `mv_meta_weekly`, `mv_meta_by_campaign`) con los datos más recientes de la tabla cruda. No borra ni modifica datos crudos."

2. Ejecutá el comando.

3. Mostrale la salida al usuario.

## Reglas

- Hablá en castellano.
- Si el comando falla, leé el error y explicáselo en castellano antes de proponer un fix.
