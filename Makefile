# Конструктор СКИБ — единая точка входа для сборки, тестирования и запуска
# (раздел 10.3 ТЗ). Цель без аргументов — help. Тела целей могут уточняться,
# перечень закреплён ТЗ. Контейнерный рантайм переопределяется переменной
# DOCKER (например: make docker-build DOCKER=podman).

DOCKER ?= docker
IMAGE  ?= skib-lab
TAG    ?= 0.01.08
PORT   ?= 8080
BASE_PATH ?= /
# Базовый образ этапа сборки Dockerfile (запасной вариант — node:22-slim).
NODE_IMAGE ?= node:22-alpine
# Имя архива поставки (исходники + документация и отчёты в docs/).
SKIB_ZIP ?= skib-lab-$(TAG)-src.zip

.PHONY: help install dev build preview lint test-unit test-unit-coverage \
        test-e2e test check check-makefile zip docker-build docker-run docker-start docker-stop \
        docker-logs docker-shell clean distclean

help: ## список целей (по умолчанию)
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk -F':.*?## ' '{printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}'

install: ## установка зависимостей (npm ci)
	npm ci

dev: ## dev-сервер приложения, порт PORT (по умолчанию 3000)
	npm run dev

build: ## производственная сборка (статический каталог out/)
	npm run build

preview: ## локальный запуск собранной версии, порт PORT (по умолчанию 4173)
	npx --yes serve out -s -l $${PORT:-4173}

lint: ## eslint, проверка типов tsc --noEmit
	npx tsc --noEmit
	npm run lint

test-unit: ## unit-тесты Vitest (движок, парсеры, хранилище)
	npm run test:unit

test-unit-coverage: ## unit-тесты с отчётом покрытия и порогами 11.2
	npm run test:unit:coverage

test-e2e: ## E2E-тесты Playwright (webServer использует dev-сервер, порт PORT, по умолчанию 3000)
	npm run test:e2e

test: ## test-unit затем test-e2e
	npm test

check: ## проверка Makefile, затем lint и test — полная проверка перед сдачей
	$(MAKE) check-makefile
	$(MAKE) lint
	$(MAKE) test

check-makefile: ## синтаксическая проверка Makefile — сухой прогон всех целей (правило проекта)
	$(MAKE) --no-print-directory -n help install dev build preview lint test-unit test-unit-coverage test-e2e test zip docker-build docker-run docker-start docker-stop docker-logs docker-shell clean distclean > /dev/null
	@echo "Makefile: синтаксис и табуляция в порядке (сухой прогон целей прошёл)."

zip: ## упаковать исходники, документацию и отчёты (docs/) в $(SKIB_ZIP)
	@command -v zip >/dev/null 2>&1 || { echo "Утилита zip не найдена (пакет zip)."; exit 1; }
	rm -f $(SKIB_ZIP)
	zip -q -r $(SKIB_ZIP) src samples tests docs public nginx scripts .github \
                .dockerignore .gitignore .nvmrc CHANGELOG.md Caddyfile Dockerfile LICENSE \
                Makefile README.md components.json docker-compose.yml eslint.config.mjs \
                next.config.ts package.json package-lock.json playwright.config.ts \
                playwright.firefox.config.ts postcss.config.mjs tsconfig.json vitest.config.ts
	@echo "Архив собран: $(SKIB_ZIP) (отчёты — в docs/)"

docker-build: ## сборка образа $(IMAGE):$(TAG) с аргументами BASE_PATH, NODE_IMAGE
	@command -v $(DOCKER) >/dev/null 2>&1 || { echo "Контейнерный рантайм «$(DOCKER)» не найден. Установите Docker Engine 24+ или Podman 4+, либо вызовите с DOCKER=podman."; exit 1; }
	$(DOCKER) build --build-arg NODE_IMAGE=$(NODE_IMAGE) --build-arg APP_VERSION=$(TAG) --build-arg BASE_PATH=$(BASE_PATH) -t $(IMAGE):$(TAG) .

docker-run: ## запуск образа на переднем плане, порт $(PORT)
	@command -v $(DOCKER) >/dev/null 2>&1 || { echo "Контейнерный рантайм «$(DOCKER)» не найден."; exit 1; }
	$(DOCKER) run --rm -p $(PORT):8080 $(IMAGE):$(TAG)

docker-start: ## запуск в фоне с именем контейнера skib-lab
	@command -v $(DOCKER) >/dev/null 2>&1 || { echo "Контейнерный рантайм «$(DOCKER)» не найден."; exit 1; }
	$(DOCKER) run -d --name skib-lab -p $(PORT):8080 $(IMAGE):$(TAG)

docker-stop: ## остановка и удаление контейнера skib-lab
	@command -v $(DOCKER) >/dev/null 2>&1 || { echo "Контейнерный рантайм «$(DOCKER)» не найден."; exit 1; }
	$(DOCKER) rm -f skib-lab

docker-logs: ## логи контейнера skib-lab
	@command -v $(DOCKER) >/dev/null 2>&1 || { echo "Контейнерный рантайм «$(DOCKER)» не найден."; exit 1; }
	$(DOCKER) logs -f skib-lab

docker-shell: ## оболочка sh в контейнере для диагностики
	@command -v $(DOCKER) >/dev/null 2>&1 || { echo "Контейнерный рантайм «$(DOCKER)» не найден."; exit 1; }
	$(DOCKER) exec -it skib-lab sh

clean: ## удаление артефактов сборки и отчётов
	rm -rf out coverage playwright-report test-results .next

distclean: ## clean плюс удаление node_modules
	$(MAKE) clean
	rm -rf node_modules
