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

# Light blue for the notes a recipe prints after its own output. `android-usb`
# ends with several hundred lines of build log, and a plain reminder underneath
# it reads as more of the same. Printed with `printf` rather than `echo`,
# because bash's builtin `echo` does not expand these without `-e`.
ifdef NO_COLOR
NOTE :=
NOTE_OFF :=
else
NOTE := \033[94m
NOTE_OFF := \033[0m
endif

# Capacitor installs through native-run, which looks for the SDK in the
# environment rather than in android/local.properties the way Gradle does. Read
# it back from the file that already records it, so the path is stated once and
# `make android` does not depend on what a particular shell exports.
ANDROID_SDK := $(shell sed -n 's/^sdk\.dir=//p' android/local.properties 2>/dev/null)

.PHONY: help fast verify deep audit ci ci-static ci-unit ci-security ci-browser ci-mutation-security dev android android-build android-usb test lint format clean clean-cache

help: ## Show this list
	@echo 'Fit_ gates. Same checks as CI; the difference is what runs in parallel.'
	@echo
	@grep -hE '^[a-z-]+:.*##' $(MAKEFILE_LIST) | sort | awk -F':.*##' '{printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'
	@echo
	@echo 'ci  runs every CI job; the light ones in parallel, mutation on its own.'
	@printf '\n$(NOTE)Running the app on a phone, in order:\n'
	@printf '  1. bun run dev --host 127.0.0.1 --port $(ANDROID_USB_PORT)   # leave running\n'
	@printf '  2. connect the phone over USB, accept the debugging prompt\n'
	@printf '  3. make android-usb                           # build, install, launch\n\n'
	@printf 'android-usb needs the server from step 1 already up; it does not start one.\n'
	@printf 'Re-run it after a code change or after unplugging (adb reverse dies with the cable).$(NOTE_OFF)\n'

fast: ## Static checks and server tests. No Docker, no browser (~50s)
	@$(GATE) verify:fast

verify: ## The pre-push gate: adds coverage, build, budgets (~45s)
	@$(GATE) verify

deep: ## Adds mutation and end-to-end flows (~9m warm; cold runs are hardware-dependent)
	@$(GATE) verify:deep

audit: ## The three mutation lanes CI runs daily instead of per pull request
	@$(GATE) audit

# Each job is exactly the slice CI gives its own runner.
ci-static: ; @$(GATE) ci --job static
ci-unit: ; @$(GATE) ci --job unit
ci-security: ; @$(GATE) ci --job security
ci-mutation-security: ; @$(GATE) ci --job mutation-security

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

# The shipped build has no backend: `webDir` is a static bundle and the client
# calls relative paths, so in a WebView they resolve against `capacitor://localhost`
# and reach nothing. Signing in on a device therefore needs the app served from
# the machine running the API, and `adb reverse` is the way that costs nothing:
# the phone's own `localhost` becomes this host over the USB cable. No DNS to
# resolve, no certificate to trust, and — because loopback is the one host
# `session-cookie.ts` does not mark `Secure` — the session cookie survives, which
# is what a LAN address or any other cleartext host silently breaks.
ANDROID_USB_PORT ?= 5175

android-usb: ## Install a device build that talks to this machine over USB, and run it
	@test -n '$(ANDROID_SDK)' || { echo 'No sdk.dir in android/local.properties — open the project in Android Studio once, or write it by hand.'; exit 1; }
	@ADB='$(ANDROID_SDK)/platform-tools/adb'; \
	$$ADB devices | grep -qw device || { echo 'No device: connect over USB and accept the debugging prompt on the phone.'; exit 1; }; \
	curl -fsS -o /dev/null "http://127.0.0.1:$(ANDROID_USB_PORT)/" || { echo "No dev server on $(ANDROID_USB_PORT). Run: bun run dev --host 127.0.0.1 --port $(ANDROID_USB_PORT)"; exit 1; }; \
	$$ADB reverse tcp:$(ANDROID_USB_PORT) tcp:$(ANDROID_USB_PORT); \
	FIT_CAPACITOR_SERVER_URL=http://localhost:$(ANDROID_USB_PORT) bun run android:sync; \
	(cd android && ./gradlew -q assembleDebug); \
	$$ADB install -r android/app/build/outputs/apk/debug/app-debug.apk; \
	$$ADB shell svc power stayon usb; \
	$$ADB shell am force-stop email.psilva.fit; \
	$$ADB shell am start -n email.psilva.fit/.MainActivity
	@printf '\n$(NOTE)  App installed and launched, talking to http://localhost:$(ANDROID_USB_PORT) over USB.\n\n'
	@printf '  Keep running, or the app has no backend:\n'
	@printf '    bun run dev --host 127.0.0.1 --port $(ANDROID_USB_PORT)\n\n'
	@printf '  Re-run make android-usb after a code change, or after unplugging\n'
	@printf '  (adb reverse dies with the cable). Cable back in, app already installed:\n'
	@printf '    adb reverse tcp:$(ANDROID_USB_PORT) tcp:$(ANDROID_USB_PORT)\n$(NOTE_OFF)\n'

# Mutation testing is CPU-bound and sizes itself to the machine, so the security
# lane runs on its own after the lighter jobs. It is the only one left on the
# merge gate; `make audit` runs the three that moved to the daily schedule.
ci: ## Everything CI runs: light lanes in parallel, then mutation (~6m warm locally)
	@$(MAKE) -j4 --output-sync=target ci-static ci-unit ci-security ci-browser
	@$(GATE) ci --job mutation-security

test: ## Unit and component tests only
	@bun run test:unit

lint: ## Formatting and lint, without the rest of the gate
	@bun run format:check && bun run lint

format: ## Rewrite formatting in place
	@bun run format

clean: ## Remove build output, reports, and leftover sandboxes
	@rm -rf build build-capacitor coverage reports/quality/logs .stryker-tmp
	@echo 'Removed build output, reports, and sandboxes.'

# Separate from `clean`, because refilling it means pulling five scanner
# images and Trivy's database again. Trivy's copy alone is over a gigabyte.
clean-cache: ## Also remove the cached scanner images and vulnerability database
	@rm -rf .security-cache
	@echo 'Removed the scanner image and database cache.'
