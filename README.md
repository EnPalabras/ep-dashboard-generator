# En Palabras — Dashboard Generator

Servidor de dashboards para el equipo de En Palabras. Los dashboards son HTML estáticos generados por Claude que consumen una API local.

## Setup

### 1. Instalar Bun

```bash
curl -fsSL https://bun.sh/install | bash
```

Más info: https://bun.sh/docs/installation

### 2. Instalar dependencias

```bash
bun install
```

### 3. Pedir el `.env`

Pedile el archivo `.env` a alguien del equipo y ponelo en la raíz del proyecto. Contiene credenciales de la base de datos, Google OAuth y Meta Ads API.

### 4. Levantar el server

```bash
bun run dev
```

Abrí http://localhost:3000 y logueate con tu cuenta `@enpalabras.com.ar`.

## Generar un dashboard

Pedile a Claude Code que cree un dashboard. Por ejemplo:

> "Creá un dashboard que muestre el gasto semanal de Meta de los últimos 3 meses"

Claude lee el `CLAUDE.md` del proyecto, que tiene las instrucciones específicas: cómo estructurar el HTML, qué endpoints de la API están disponibles, qué clases CSS usar y cómo registrar el dashboard en la base de datos.

## Comandos útiles

```bash
bun run dev              # Server con hot reload
bun run batch            # Traer datos de Meta Ads
bun run db:refresh-views # Refrescar las materialized views
```
