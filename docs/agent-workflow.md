# Локальный запуск и проверки

Открывай это руководство при настройке окружения или запуске проверок.
Правила работы находятся в [AGENTS.md](../AGENTS.md), тестовая политика в
[§10 ядра](../tech.md#10-стратегия-тестов), поставка в [deploy.md](deploy.md).

## Локальный запуск

Нужны Node.js 22 или новее и pnpm 10.11.0 (`package.json`). CI использует Node 22.
Установи зависимости `pnpm install --frozen-lockfile`. Для e2e один раз выполни
`pnpm exec playwright install chromium`; на Linux могут потребоваться системные
зависимости: `pnpm exec playwright install --with-deps chromium`.

Скрипты CLI читают экспортированное окружение через `config.ts`, сами `.env`
не загружают. Для локальной работы с фейковыми драйверами в отдельном терминале:

```bash
export NODE_ENV=development
export ORIGIN=http://localhost:5173
export DATABASE_PATH=./data/app.db
export FILES_DIR=./data/files
export SESSION_SECRET=local-development-secret-at-least-32-chars
export MAIL_DRIVER=fake
export PUSH_DRIVER=fake
pnpm db:migrate
pnpm seed
pnpm dev --port 5173 --strictPort
```

Этот секрет подходит только для локальных фикстур. Для стенда используй его
настройки по `docs/deploy.md`. Существующую `.env` не перезаписывай.
Перед сидом или CLI проверяй целевые `DATABASE_PATH` и `FILES_DIR`.
Демо-данные добавляет отдельная `pnpm seed:demo`; гейт её не вызывает.

## Проверки

Определения команд находятся в [package.json](../package.json).
Для точечной проверки, например:

```bash
pnpm exec vitest run tests/unit/profile.spec.ts
pnpm test:e2e tests/e2e/crm-shop.e2e.ts
```

Unit setup создаёт отдельную временную БД на файл. Playwright использует
`data/e2e.db`, `data/e2e-files` и порт 4173, мигрирует БД до старта сервера,
затем выполняет global setup. За значения отвечают `playwright.config.ts`
и `tests/e2e/global-setup.ts`.

Сборка требует экспортированного `SESSION_SECRET` длиной от 32 символов.
Порт 4173 должен быть свободен; в обычном локальном запуске Playwright может
переиспользовать сервер. Для гейта `CI=1` отключает переиспользование.
Сборку и e2e выполняй последовательно: они меняют общий `build/`.

## Полный гейт перед мёрджем

Состав гейта: [§11.1](../tech.md#111-ci). CI выполняет те же проверки через
[ручной workflow](../.github/workflows/ci.yml); команды ниже для локального запуска.

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm check
pnpm test:unit
CI=1 pnpm test:e2e --reporter=list
pnpm build
```

Дополнительно проверь миграции и сид на чистой временной БД и health именно
через `node build`. Следующий блок выполняется после сборки, в subshell,
чтобы тестовое окружение не заменяло настройки текущего терминала:

```bash
(
  set -eu
  gate_dir=$(mktemp -d)
  server_pid=
  cleanup() {
    if [ -n "$server_pid" ]; then
      kill "$server_pid" 2>/dev/null || true
      wait "$server_pid" 2>/dev/null || true
    fi
    rm -rf "$gate_dir"
  }
  trap cleanup EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
  export NODE_ENV=production
  export PORT=4174
  export ORIGIN=http://localhost:4174
  export DATABASE_PATH="$gate_dir/app.db"
  export FILES_DIR="$gate_dir/files"
  export SESSION_SECRET=local-gate-secret-value-at-least-32-chars
  export MAIL_DRIVER=fake
  export PUSH_DRIVER=fake
  export LOG_LEVEL=warn
  pnpm db:migrate
  pnpm seed
  node build >"$gate_dir/server.log" 2>&1 &
  server_pid=$!
  ready=
  for attempt in $(seq 1 30); do
    if ! kill -0 "$server_pid" 2>/dev/null; then
      cat "$gate_dir/server.log"
      exit 1
    fi
    if curl -fsS "$ORIGIN/api/health"; then ready=1; break; fi
    sleep 1
  done
  test "$ready" = 1
)
```

Порт 4174 тоже должен быть свободен. При проверке изменения схемы дополнительно
прогони миграции на копии дев-базы (§13.5), сохраняя исходник.
