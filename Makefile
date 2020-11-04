.PHONY: all dep bootstrap lint link build clean distclean test

all: dep bootstrap build

node_modules: node_modules.sentinel
dep: node_modules

bootstrap: node_modules
	npm run bootstrap

link: node_modules
	npm run link

build: link
	npm run build

test: node_modules
	npm run test

clean:
	-npm run clean

distclean: clean
	-npm run distclean
	@rm -f node_modules.sentinel
	@rm -f aws/tools/generator-strategy-gate/npm_link.sentinel

lint: node_modules
	npm run lint

node_modules.sentinel:
	npm install
	@touch node_modules.sentinel
