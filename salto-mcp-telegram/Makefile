PROJECT_DIR := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
NPM := npm --prefix $(PROJECT_DIR)

.PHONY: install dev build start test lint format clean

install:
$(NPM) install

dev:
$(NPM) run dev

build:
$(NPM) run build

start:
$(NPM) run start

test:
$(NPM) run test

lint:
$(NPM) run lint

format:
$(NPM) run format

clean:
rm -rf $(PROJECT_DIR)/dist $(PROJECT_DIR)/node_modules
