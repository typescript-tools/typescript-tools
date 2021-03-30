.PHONY: all
all: dep bootstrap build

node_modules: node_modules.sentinel

.PHONY: dep
dep: node_modules

.PHONY: bootstrap
bootstrap: node_modules
	npm run bootstrap

.PHONY: lint
link: node_modules
	npm run link

.PHONY: link
build: link
	npm run build

.PHONY: test
test: node_modules
	npm run test

.PHONY: clean
clean:
	-npm run clean

.PHONY: distclean
distclean: clean
	-npm run distclean
	@rm -f node_modules.sentinel
	@rm -f aws/tools/generator-strategy-gate/npm_link.sentinel

.PHONY: lint
lint: node_modules
	npm run lint

node_modules.sentinel:
	npm install
	@touch node_modules.sentinel
