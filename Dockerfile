# Конструктор СКИБ — сборка исполняемого образа (раздел 10.2 ТЗ).
# Многоэтапная сборка: builder на node:22-alpine, runtime на nginx:1.27-alpine.
# Node 22 (не 20) — требование engines vitest 5 из devDependencies: на node 20
# npm ci выводит предупреждения EBADENGINE, а vitest официально не поддерживается.
# Если на узле сборки npm ci обрывается («Exit handler never called!»), соберите
# на debian-варианте: make docker-build NODE_IMAGE=node:22-slim

# Версия инструмента, отображаемая в интерфейсе (NEXT_PUBLIC_APP_VERSION).
ARG APP_VERSION=0.01.08
# Базовый путь публикации для вариантов В1 и В4 (раздел 10.1).
ARG BASE_PATH=/
# Базовый образ этапа сборки; по умолчанию Alpine, запасной вариант — Debian slim.
ARG NODE_IMAGE=node:22-alpine

# ---------- Этап 1: сборка статического сайта ----------
FROM ${NODE_IMAGE} AS builder

ARG APP_VERSION
ARG BASE_PATH

WORKDIR /app

# libc6-compat — стандартное требование Next.js на Alpine: часть нативных
# модулей рассчитана на glibc-совместимый рантайм. На Debian (slim) не нужно.
RUN if command -v apk >/dev/null 2>&1; then apk add --no-cache libc6-compat; fi

# Устойчивость npm к обрывам сети и ограниченным ресурсам узла сборки.
# Известная ошибка npm «Exit handler never called!» возникает, когда загрузка
# пакетов прерывается (нестабильная сеть, прокси, нехватка памяти контейнера).
# Лечение: больше повторных попыток, длинные таймауты, мало одновременных
# соединений, отказ от лишних запросов (audit/fund) и умеренная куча node.
ENV npm_config_fetch_retries=8 \
    npm_config_fetch_retry_mintimeout=20000 \
    npm_config_fetch_retry_maxtimeout=180000 \
    npm_config_fetch_timeout=600000 \
    npm_config_maxsockets=4 \
    npm_config_audit=false \
    npm_config_fund=false \
    npm_config_progress=false \
    npm_config_loglevel=warn \
    NODE_OPTIONS=--max-old-space-size=3072

# Зависимости по зафиксированному списку (воспроизводимая установка).
# Кэш npm (/root/.npm) сохраняется между сборками средствами BuildKit
# (Docker Engine 24+ / Podman 4+): скачанные пакеты не качаются заново даже
# после неудачной попытки. Резервная попытка с двумя соединениями — для
# строгих сетей и прокси, рвущих параллельные запросы.
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --prefer-offline || \
    (npm cache clean --force && \
     npm ci --maxsockets=2 --fetch-retries=12 --fetch-retry-maxtimeout=300000)

# Сборка: next build с output: "export" создаёт статический каталог out/.
COPY . .
ENV NEXT_PUBLIC_APP_VERSION=${APP_VERSION}
ENV BASE_PATH=${BASE_PATH}
# next.config.ts читает BASE_PATH и задаёт basePath/assetPrefix.
RUN npm run build

# ---------- Этап 2: обслуживание статических файлов ----------
FROM nginx:1.27-alpine

ARG APP_VERSION

LABEL org.opencontainers.image.title="Конструктор СКИБ (skib-lab)" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.description="Лабораторный веб-инструмент курса «Проектирование систем с конструктивной информационной безопасностью»: домены безопасности, функции безопасности, светофор покрытия целей и модель стоимости. Серверной части нет — данные хранятся в браузере."

COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY --from=builder /app/out /usr/share/nginx/html

EXPOSE 8080

# HEALTHCHECK образа — раздел 10.2, пункт 4.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1

# nginx.conf запускает мастер-процесс непривилегированным пользователем
# (pid и временные каталоги в /tmp) — раздел 10.2, пункт 3.
CMD ["nginx", "-g", "daemon off;"]
