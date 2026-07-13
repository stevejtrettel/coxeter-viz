# coxeter-groups — one command surface over the two subprojects.
#
#   src/coxeter_groups/  the Python package (the product) — run from repo root
#   renderer/            the TS engine that builds its vendored bundle — run there
#
# This Makefile hides that split: every target below cd's to the right place.

.DEFAULT_GOAL := help
PY := .venv/bin/python
DEMO ?= group

.PHONY: help setup setup-py setup-js dev bundle typecheck test test-py test-js

help: ## List the targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

setup: setup-py setup-js ## Build both dev environments from scratch

setup-py: ## Python: fresh venv + the package (editable), export extra, dev tools
	uv venv
	uv pip install -e ".[export]" --group dev

setup-js: ## TS engine: npm install
	cd renderer && npm install

dev: ## Run a demo dev-server (make dev DEMO=<name>; default: group)
	cd renderer && npm run dev $(DEMO)

bundle: ## Build the renderer and vendor it into src/coxeter_groups/viz/_static/
	cd renderer && npm run build:bundle

typecheck: ## TS strict typecheck
	cd renderer && npm run typecheck

test: test-js test-py ## Run both suites (TS then Python)

test-js: ## vitest (the renderer)
	cd renderer && npm run test

test-py: ## pytest (the package)
	$(PY) -m pytest
