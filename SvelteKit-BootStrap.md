# SvelteKit Quick Start (Bun)

Commands to scaffold and run a new SvelteKit app using [Bun](https://bun.sh/).

## Prerequisites

- [Bun](https://bun.sh/docs/installation) 1.0+
- Optional: [Node.js](https://nodejs.org/) 18+ (some tooling still expects it)

## Create a new project

From this directory (or any parent folder):

```sh
bunx sv create .
```

Or create a new subfolder:

```sh
bunx sv create my-app
cd my-app
```

The CLI will ask about TypeScript, add-ons (ESLint, Prettier, Tailwind, etc.), and whether to install dependencies.

### Non-interactive example

Basic setup:

```sh
bunx sv create my-app --template minimal --types ts --add eslint prettier tailwindcss --install bun
cd my-app
```

Quality-focused setup for AI-driven development:

```sh
bunx sv create . \
  --template minimal \
  --types ts \
  --add prettier eslint vitest="usages:unit+component" playwright mcp="ide:cursor+setup:remote" \
  --install bun
```

## Install dependencies

If you skipped install during setup:

```sh
bun install
```

## Development

Start the dev server (default: <http://localhost:5173>):

```sh
bun run dev
```

Open in the browser:

```sh
bun run dev -- --open
```

## Build and preview

Create a production build:

```sh
bun run build
```

Preview the production build locally:

```sh
bun run preview
```

## Useful follow-up commands

Add integrations after the project exists:

```sh
bunx sv add tailwindcss --install bun
bunx sv add eslint --install bun
bunx sv add prettier --install bun
bunx sv add vitest --install bun
bunx sv add playwright --install bun
```

Add Drizzle, Better Auth, and MCP in one go:

```sh
bunx sv add \
  drizzle="database:sqlite+client:libsql+docker:no" \
  better-auth="demo:password" \
  mcp="ide:cursor+setup:remote" \
  --install bun
```

Check the project for issues:

```sh
bunx sv check
bunx sv check --fail-on-warnings
```

## Agent quality pipeline

Run after changes to get deterministic pass/fail results:

```sh
bun run check
bun run lint
bun run test
bun run build
```

Or combine into a single verify script in `package.json`:

```json
{
	"scripts": {
		"verify": "bun run check && bun run lint && bun run test && bun run build"
	}
}
```

## Project layout (basics)

- `src/routes/` — pages and API routes (file-based routing)
- `src/lib/` — shared components and utilities
- `src/app.html` — HTML shell
- `svelte.config.js` — SvelteKit configuration

## Docs

- [SvelteKit docs](https://svelte.dev/docs/kit)
- [Svelte CLI (`sv`) docs](https://svelte.dev/docs/cli)
- [Bun docs](https://bun.sh/docs)
