# Деплой демо-стенда

Стенд работает на одном VPS в двух контейнерах. `app` запускает SvelteKit, воркер очереди и SQLite. `caddy` принимает трафик на 80 и 443, сам выпускает сертификат Let's Encrypt и проксирует запросы в `app:3000`.

База и загруженные файлы лежат в томе `b2b-coffins_app-data`, сертификаты в томе `b2b-coffins_caddy-data`. Пересборка и перезапуск контейнеров их не трогают.

## Что нужно от сервера

- Ubuntu 22.04 или 24.04, от 1 vCPU, 1 ГБ RAM и 10 ГБ диска. На 1 ГБ сборка образа идёт медленно, поэтому добавьте swap на 2 ГБ.
- Открытые порты 22, 80 и 443.
- Домен с A-записью на IP сервера. Если домена нет, возьмите адрес вида `203-0-113-10.sslip.io`: он сразу указывает на `203.0.113.10`, и Let's Encrypt выдаёт на него сертификат.

## Первый запуск

1. Поставьте Docker с плагином compose:

   ```bash
   curl -fsSL https://get.docker.com | sh
   ```

2. Добавьте swap, если на сервере 1 ГБ памяти:

   ```bash
   fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
   echo '/swapfile none swap sw 0 0' >> /etc/fstab
   ```

3. Склонируйте репозиторий:

   ```bash
   git clone git@github.com:Sobol17/b2b-coffins.git /opt/b2b-coffins
   cd /opt/b2b-coffins
   ```

   Если репозиторий приватный, сначала создайте на сервере ключ `ssh-keygen -t ed25519` и добавьте публичную часть в Deploy keys репозитория с доступом только на чтение.

4. Создайте `.env` из примера и заполните `APP_DOMAIN` и `SESSION_SECRET`:

   ```bash
   cp .env.production.example .env
   sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=$(openssl rand -base64 48)|" .env
   nano .env
   ```

   `ORIGIN`, `DATABASE_PATH`, `FILES_DIR` и `PORT` задаёт `compose.yml`, в `.env` их не пишите.

5. Соберите образ и запустите стенд:

   ```bash
   docker compose up -d --build
   ```

   Контейнер `app` при каждом старте применяет миграции и только потом поднимает сервер. `caddy` ждёт, пока `app` ответит на `/api/health`.

6. Наполните базу демо-данными:

   ```bash
   docker compose run --rm app pnpm seed
   ```

   Для показа добавьте демо-заявки «Ритуал-Сервис» во всех статусах и журнал уведомлений. Письма при этом не уходят даже с настроенным SMTP:

   ```bash
   docker compose run --rm app pnpm seed:demo
   ```

   Сид повторно запускать безопасно. Логины и пароли лежат в `scripts/fixtures/counterparties.json` и `scripts/fixtures/crm-users.json`. Репозиторий их раскрывает, поэтому на стенде с реальными данными сид не запускайте.

7. Проверьте стенд:

   ```bash
   curl https://<домен>/api/health
   ```

   Ответ `"status":"ok"` и `"workerRunning":true` означает, что сервер и очередь работают.

## Обновление

```bash
cd /opt/b2b-coffins
git pull
docker compose up -d --build
```

Во время пересборки старый контейнер продолжает отвечать. Перерыв длится несколько секунд, пока новый контейнер применяет миграции и стартует.

## Команды администратора

CLI из `tech.md` §2 работает внутри контейнера:

```bash
docker compose exec app pnpm admin user:create --email ... --name ... --role ... --password ...
docker compose exec app pnpm admin request:transition --request ... --to ... --actor ...
```

Файл для `price:import` сначала скопируйте в контейнер:

```bash
docker compose cp prices.xlsx app:/app/data/prices.xlsx
docker compose exec app pnpm admin price:import --file /app/data/prices.xlsx --price-list ...
```

## Логи

```bash
docker compose logs -f app
docker compose logs -f caddy
```

## Резервная копия

SQLite работает в режиме WAL, поэтому файл базы копируется через API `backup`, а не через `cp`:

```bash
docker compose exec app node --input-type=module -e "import Database from 'better-sqlite3'; await new Database(process.env.DATABASE_PATH, { readonly: true }).backup('/app/data/backup.db')"
docker compose exec -T app tar --exclude='app.db*' -czf - -C /app/data . > backup-$(date +%F).tar.gz
docker compose exec app rm /app/data/backup.db
```

Архив содержит `backup.db` и каталог `files`. Для восстановления остановите `app`, положите `backup.db` в том под именем `app.db`, верните `files` и запустите `app`.

## Почта

По умолчанию `MAIL_DRIVER=fake`: письма никуда не уходят, в лог попадает только тема письма. Для реальной отправки задайте в `.env` значения `MAIL_DRIVER=smtp`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` и `MAIL_FROM`, затем выполните `docker compose up -d`. Без `SMTP_HOST` и `MAIL_FROM` контейнер не стартует.

## Что стенд не делает

- CD нет: мёрдж в `main` ничего не разворачивает, обновление запускается вручную.
- Автоматического бэкапа нет.
- PWA и Web Push появятся в слайсе C15.
