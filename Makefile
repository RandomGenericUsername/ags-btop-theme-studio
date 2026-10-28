.PHONY: help platform-dev contracts-dev deps types test conformance drift live-tests ci bundle typecheck gates clean

# The program tuple this app builds/tests against (AD-31/AD-34). v0.3.0 is
# LOCAL-ONLY in this run: local gates use gitignored symlinks under .dev/;
# CI checks the exact tags out explicitly once published.
AGS_PLATFORM_VERSION := v0.3.0
CONTRACTS_VERSION := v0.3.0
AGS_PLATFORM_REPO := https://github.com/RandomGenericUsername/ags-platform.git
CONTRACTS_REPO := https://github.com/RandomGenericUsername/contracts.git
AGS_PLATFORM_DEV ?=
PLATFORM_FETCH_DIR := $(CURDIR)/.dev/ags-platform/$(AGS_PLATFORM_VERSION)
PLATFORM_SRC := $(if $(AGS_PLATFORM_DEV),$(AGS_PLATFORM_DEV),$(PLATFORM_FETCH_DIR))
CONTRACTS_FETCH_DIR := $(CURDIR)/.dev/contracts/$(CONTRACTS_VERSION)
CONTRACTS_ROOT ?= $(if $(wildcard $(CONTRACTS_FETCH_DIR)/schemas/ags-app-manifest.schema.json),$(CONTRACTS_FETCH_DIR),$(CURDIR)/../contracts)
BUNDLE_FILE := build/btop-theme-studio.js

help:
	@echo "make test          pure suites + executable palette-refresh handler tests (stock runner)"
	@echo "make conformance   manifest + handler + template conformance (stock runner)"
	@echo "make drift         re-derive lib/key_widgets.json from vendored btop sources (stock runner)"
	@echo "make typecheck     desktop-stack tsc gate (LOCAL; needs ags + GIR)"
	@echo "make bundle        ags bundle smoke build (LOCAL; needs ags)"
	@echo "make live-tests    real btop on a pty (LOCAL/manual; needs uv + pyte + btop)"
	@echo "make ci            stock-runner gate: test + conformance + drift"
	@echo "make gates         all local gates: test + conformance + drift + bundle + typecheck"
	@echo ""
	@echo "Local-only v0.3.0 tuple: put a checkout/symlink at"
	@echo "  .dev/ags-platform/v0.3.0  (or AGS_PLATFORM_DEV=/path/to/ags-platform)"
	@echo "  .dev/contracts/v0.3.0     (or CONTRACTS_ROOT=/path/to/contracts)"
	@echo "Default contracts fallback is ../contracts."

# The platform shortcut. It MUST point outside node_modules: Node refuses to
# type-strip `.ts` under a real node_modules directory, but realpaths a symlink
# whose target sits outside. AGS's esbuild resolves the same bare specifier.
platform-dev:
	@mkdir -p "$(dir $(PLATFORM_FETCH_DIR))" node_modules
	@src=""; \
	if [ -n "$(AGS_PLATFORM_DEV)" ]; then src="$(AGS_PLATFORM_DEV)"; \
	elif [ -f "$(PLATFORM_FETCH_DIR)/index.ts" ]; then src="$(PLATFORM_FETCH_DIR)"; \
	elif [ -f "$(CURDIR)/../ags-platform/index.ts" ]; then \
		echo "==> platform-dev: linking local ags-platform checkout at $(PLATFORM_FETCH_DIR)"; \
		ln -sfn ../../../ags-platform "$(PLATFORM_FETCH_DIR)"; src="$(PLATFORM_FETCH_DIR)"; \
	else \
		echo "==> platform-dev: fetching ags-platform $(AGS_PLATFORM_VERSION) (shallow)"; \
		rm -rf "$(PLATFORM_FETCH_DIR)"; \
		git clone --depth 1 --branch $(AGS_PLATFORM_VERSION) $(AGS_PLATFORM_REPO) "$(PLATFORM_FETCH_DIR)" || exit 1; \
		rm -rf "$(PLATFORM_FETCH_DIR)/.git"; src="$(PLATFORM_FETCH_DIR)"; \
	fi; \
	[ -f "$$src/index.ts" ] || { echo "FAIL: platform-dev: $$src/index.ts is missing" >&2; exit 1; }; \
	ln -sfn "$$src" node_modules/ags-platform; \
	echo "==> platform-dev: node_modules/ags-platform -> $$src"

# The contracts shortcut, local-only. CI sets CONTRACTS_ROOT and checks the tag
# out at `contracts/`; locally the sibling `../contracts` is the source.
contracts-dev:
	@if [ -f "$(CONTRACTS_FETCH_DIR)/schemas/ags-app-manifest.schema.json" ]; then \
		echo "==> contracts-dev: $(CONTRACTS_FETCH_DIR) already present"; \
	elif [ -f "$(CURDIR)/contracts/schemas/ags-app-manifest.schema.json" ]; then \
		mkdir -p "$(dir $(CONTRACTS_FETCH_DIR))"; \
		ln -sfn ../../contracts "$(CONTRACTS_FETCH_DIR)"; \
		echo "==> contracts-dev: linked in-repo contracts checkout"; \
	elif [ -f "$(CURDIR)/../contracts/schemas/ags-app-manifest.schema.json" ]; then \
		mkdir -p "$(dir $(CONTRACTS_FETCH_DIR))"; \
		ln -sfn ../../../contracts "$(CONTRACTS_FETCH_DIR)"; \
		echo "==> contracts-dev: linked local contracts checkout"; \
	else \
		mkdir -p "$(dir $(CONTRACTS_FETCH_DIR))"; \
		echo "==> contracts-dev: fetching contracts $(CONTRACTS_VERSION) (shallow)"; \
		git clone --depth 1 --branch $(CONTRACTS_VERSION) $(CONTRACTS_REPO) "$(CONTRACTS_FETCH_DIR)" || exit 1; \
		rm -rf "$(CONTRACTS_FETCH_DIR)/.git"; \
	fi

# TypeScript for the local typecheck. Installed --no-save so no lockfile or
# node_modules is committed.
deps:
	@if [ ! -x node_modules/.bin/tsc ]; then \
		echo "==> deps: installing typescript@5.9 (npm install --no-save, gitignored)"; \
		npm install --no-save --no-package-lock typescript@5.9 >/dev/null || exit 1; \
	fi

# Machine-specific GIR declarations, generated for THIS host. `ags types`
# writes @girs/, env.d.ts and its own tsconfig.json (all gitignored); the
# committed typecheck config is tsconfig.app.json precisely to survive that.
types:
	@command -v ags >/dev/null || { echo "FAIL: types: ags is not on PATH (desktop stack)" >&2; exit 1; }
	@if [ -d "@girs" ]; then \
		echo "==> types: @girs/ already generated, skipping (rm -rf @girs to force)"; \
	else \
		echo "==> types: generating this host's GIR declarations"; \
		ags types -d "$(CURDIR)" -u || exit 1; \
	fi

# Pure unit suites. Node's native type stripping runs the app's real .ts
# modules; nothing reachable imports `gi://*` or `ags/*` except the dedicated
# platform-consumption wiring assertions, which read source text.
test: platform-dev
	@command -v node >/dev/null || { echo "FAIL: test: node is not on PATH" >&2; exit 1; }
	@for suite in theme-keys btop-conf key-map key-widgets-verify theme-model \
		schematic preview targets platform-consumption; do \
		echo "==> test: node tests/$$suite.mjs"; \
		node tests/$$suite.mjs || exit 1; \
	done
	@echo "==> test: node --test tests/unit.test.mjs"
	@node --test tests/unit.test.mjs

# Manifest/handler/template conformance. The platform's own checkAppRepo gate
# plus the app-specific identity, pending-aware refresh and layout assertions.
conformance: platform-dev contracts-dev
	@command -v node >/dev/null || { echo "FAIL: conformance: node is not on PATH" >&2; exit 1; }
	@[ -f "$(CONTRACTS_ROOT)/schemas/ags-app-manifest.schema.json" ] || { \
		echo "FAIL: conformance: no contracts schema at $(CONTRACTS_ROOT) (set CONTRACTS_ROOT)" >&2; exit 1; }
	@echo "==> conformance: node --test tests/app-contract.test.mjs"
	@CONTRACTS_ROOT="$(CONTRACTS_ROOT)" node --test tests/app-contract.test.mjs

# Apply-contract drift: re-derive the canonical key→widget artifact from the
# vendored btop v1.4.7 sources and fail on any drift. This app consumes no
# event-contract topic, so the generated artifact is its contract.
drift:
	@command -v python3 >/dev/null || { echo "FAIL: drift: python3 is not on PATH" >&2; exit 1; }
	@echo "==> drift: key_widgets.py --verify"
	@python3 tools/key_widgets.py tools/btop_draw.v1.4.7.cpp tools/btop_theme.cpp lib/key_widgets.json --verify

# The real-pty live engine. Deliberately NOT in gates/ci: it needs a real btop
# binary, uv and pyte. Run it by hand on a machine with that stack.
live-tests:
	@command -v uv >/dev/null || { echo "FAIL: live-tests: uv is not on PATH" >&2; exit 1; }
	@echo "==> live-tests: uv run --with pyte --with pytest pytest live/tests -q"
	@uv run --with pyte --with pytest pytest live/tests -q

# Stock-runner gate: exactly what CI runs. No AGS, no GTK, no generated GIR.
ci: test conformance drift

# AGS bundle smoke build. This catches an esbuild resolution/import error that
# the pure tests cannot see; it is a LOCAL gate because it needs the ags CLI.
bundle: platform-dev
	@command -v ags >/dev/null || { echo "FAIL: bundle: ags is not on PATH" >&2; exit 1; }
	@mkdir -p build
	@echo "==> bundle: ags bundle app.tsx $(BUNDLE_FILE)"
	ags bundle app.tsx "$(BUNDLE_FILE)"
	@[ -s "$(BUNDLE_FILE)" ] || { echo "FAIL: bundle: $(BUNDLE_FILE) is empty/missing" >&2; exit 1; }
	@echo "    OK: $(BUNDLE_FILE) ($$(wc -c < "$(BUNDLE_FILE)") bytes)"

# Desktop-stack typecheck: zero errors allowed in this repo's tree. Tolerate
# and count the AGS runtime's own /usr/share/ags/js errors (machine/GIR
# dependent) and the external platform unit's (AD-17: its own repo gates it).
typecheck: deps types platform-dev
	@[ -d "@girs" ] || { echo "FAIL: typecheck: @girs missing after types" >&2; exit 1; }
	@[ -x node_modules/.bin/tsc ] || { echo "FAIL: typecheck: typescript missing after deps" >&2; exit 1; }
	@[ -f node_modules/ags-platform/index.ts ] || { echo "FAIL: typecheck: platform link missing" >&2; exit 1; }
	@[ -e node_modules/ags ] || ln -sfn /usr/share/ags/js node_modules/ags
	@[ -e node_modules/gnim ] || ln -sfn /usr/share/ags/js/node_modules/gnim node_modules/gnim
	@echo "==> typecheck: tsc --noEmit -p tsconfig.app.json"
	@log=$$(mktemp); \
	npx tsc --noEmit -p tsconfig.app.json > "$$log" 2>&1; \
	ours=$$(grep 'error TS' "$$log" | grep -E '^(app\.tsx|lib/|ui/|env\.d\.ts)' || true); \
	thirdparty=$$(grep 'error TS' "$$log" | grep -F '/usr/share/ags/js/' || true); \
	platform=$$(grep 'error TS' "$$log" | grep -F 'ags-platform/' || true); \
	other=$$(grep 'error TS' "$$log" | grep -vE '^(app\.tsx|lib/|ui/|env\.d\.ts)' | grep -vF '/usr/share/ags/js/' | grep -vF 'ags-platform/' || true); \
	echo "    tolerated third-party errors (/usr/share/ags/js): $$(printf '%s\n' "$$thirdparty" | grep -c . || true)"; \
	echo "    tolerated ags-platform errors (external unit, AD-17): $$(printf '%s\n' "$$platform" | grep -c . || true)"; \
	if [ -n "$$other" ]; then \
		echo "FAIL: errors in neither this repo nor the known ags runtime:"; \
		printf '%s\n' "$$other"; rm -f "$$log"; exit 1; \
	fi; \
	if [ -n "$$ours" ]; then \
		echo "FAIL: type errors in the ags-btop-theme-studio tree:"; \
		printf '%s\n' "$$ours"; rm -f "$$log"; exit 1; \
	fi; \
	echo "    OK: 0 errors in the ags-btop-theme-studio tree"; \
	rm -f "$$log"

gates: test conformance drift bundle typecheck

clean:
	@rm -rf build
