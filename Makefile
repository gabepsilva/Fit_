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

# Capacitor installs through native-run, which looks for the SDK in the
# environment rather than in android/local.properties the way Gradle does. Read
# it back from the file that already records it, so the path is stated once and
# `make android` does not depend on what a particular shell exports.
ANDROID_SDK := $(shell sed -n 's/^sdk\.dir=//p' android/local.properties 2>/dev/null)

.PHONY: help fast verify deep audit ci ci-static ci-unit ci-security ci-browser ci-mutation-security ci-mutation-node ci-mutation-client ci-mutation-full dev android android-build test lint format clean

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

deep: ## Adds mutation and end-to-end flows (~9m warm; cold runs are hardware-dependent)
	@$(GATE) verify:deep

audit: ## Force the explicit full-tree mutation audit
	@bun run test:mutation:full -- --force-cold

# Each job is exactly the slice CI gives its own runner.
ci-static: ; @$(GATE) ci --job static
ci-unit: ; @$(GATE) ci --job unit
ci-security: ; @$(GATE) ci --job security
ci-mutation-security: ; @$(GATE) ci --job mutation-security
ci-mutation-node: ; @$(GATE) ci --job mutation-node
ci-mutation-client: ; @$(GATE) ci --job mutation-client
ci-mutation-full: ; @$(GATE) ci --job mutation-full

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
	@test -n '$(ANDROID_SDK)' || { echo 'No sdk.dir in android/local.properties — open the project in Android Studio once, or write it by hand.'; exit 1; }
	@ANDROID_HOME='$(ANDROID_SDK)' bun run android:run

android-build: ## Build the web assets and sync them into the native project
	@bun run android:sync

# Mutation testing is CPU-bound and sizes itself to the machine, so its four
# required lanes run serially after the lighter jobs. GitHub gives each mutation
# lane a runner; one workstation cannot copy that without making every lane
# slower. Each lane owns separate incremental state.
ci: ## Everything CI runs: light lanes in parallel, then mutation (~6m warm locally)
	@$(MAKE) -j4 --output-sync=target ci-static ci-unit ci-security ci-browser
	@$(MAKE) --output-sync=target ci-mutation-security ci-mutation-node ci-mutation-client ci-mutation-full

test: ## Unit and component tests only
	@bun run test:unit

lint: ## Formatting and lint, without the rest of the gate
	@bun run format:check && bun run lint

format: ## Rewrite formatting in place
	@bun run format

clean: ## Remove build output, reports, and leftover sandboxes
	@rm -rf build build-capacitor coverage reports/quality/logs .stryker-tmp
	@echo 'Removed build output, reports, and sandboxes.'
