# Local shortcuts for the quality gates.
#
# `bun scripts/quality/gate.ts` owns what each tier and CI job actually runs, so
# nothing here restates a step list. This file only decides what may run at the
# same time — which is the one thing GitHub gets for free by putting each job on
# its own runner, and a workstation has to arrange for itself.
#
# Run `make` on its own for the list.

SHELL := /bin/bash
.DEFAULT_GOAL := help
GATE := bun scripts/quality/gate.ts

.PHONY: help fast verify deep ci ci-static ci-unit ci-security ci-browser dev android android-build test lint format clean

help: ## Show this list
	@echo 'Fit_ gates. Same checks as CI; the difference is what runs in parallel.'
	@echo
	@grep -hE '^[a-z-]+:.*##' $(MAKEFILE_LIST) | sort | awk -F':.*##' '{printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'
	@echo
	@echo 'ci  runs every CI job; the light ones in parallel, mutation on its own.'

fast: ## Static checks and server tests. No Docker, no browser (~50s)
	@$(GATE) verify:fast

verify: ## The pre-push gate: adds coverage, build, budgets (~45s)
	@$(GATE) verify

deep: ## Adds mutation testing and end-to-end flows (~4m)
	@$(GATE) verify:deep

# Each job is exactly the slice CI gives its own runner.
ci-static: ; @$(GATE) ci --job static
ci-unit: ; @$(GATE) ci --job unit
ci-security: ; @$(GATE) ci --job security

# One lane, because all three contend for the same two things: `build/` and
# port 4173. The self-test belongs here too — one of its fixtures runs the
# end-to-end gate, and `reuseExistingServer` in playwright.config.ts means a
# Playwright already listening on 4173 gets reused. The fixture would then prove
# its point against the *other* lane's app, pass when it should fail, and report
# the e2e gate as broken. Measured, after it happened.
ci-browser:
	@$(GATE) ci --job build
	@$(GATE) ci --job e2e
	@$(GATE) ci --job self-test

dev: ## Run the app with hot reload on http://localhost:5173
	@bun run dev

android: ## Build the web assets and run the app on a connected device
	@bun run android:run

android-build: ## Build the web assets and sync them into the native project
	@bun run android:sync

# Mutation testing is CPU-bound and sizes itself to the machine, so it gets the
# machine. The other four lanes together take about as long as its startup, and
# running them alongside it only makes everything slower — measured, not
# assumed. First run is slow; after that Stryker's incremental state means only
# what changed is re-tested, the same advantage the CI job gets from its cache.
ci: ## Everything CI runs: light lanes in parallel, then mutation (~1m warm)
	@$(MAKE) -j3 --output-sync=target ci-static ci-security ci-browser
	@$(GATE) ci --job unit

test: ## Unit and component tests only
	@bun run test:unit

lint: ## Formatting and lint, without the rest of the gate
	@bun run format:check && bun run lint

format: ## Rewrite formatting in place
	@bun run format

clean: ## Remove build output, reports, and leftover sandboxes
	@rm -rf build build-capacitor coverage reports/quality/logs .stryker-tmp
	@echo 'Removed build output, reports, and sandboxes.'
