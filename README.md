# my podwal space

Автономный ролевой мир с двумя стартовыми ИИ-персонажами — Джейкобом и Пенни. В основе — реальные запросы к языковой модели через защищённый серверный Worker, раздельная память персонажей и Cloudflare D1 для сохранений.

## Публикация без Codex и компьютера

1. В Cloudflare создай API token с правами **Workers Scripts: Edit**, **D1: Edit**, **Account Settings: Read**.
2. В GitHub открой **Settings → Secrets and variables → Actions** и добавь:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
   - `APP_PASSWORD` — пароль входа в сайт
   - `GROQ_API_KEY` — необязательно, можно оставить пустым; тогда будет использоваться Cloudflare Workers AI.
3. Открой **Actions → Deploy my podwal space → Run workflow**.

Рабочий процесс сам соберёт исходники, проверит тесты, создаст D1-базу, применит миграцию и опубликует Worker. После завершения адрес сайта появится в журнале GitHub Actions.

Подробная инструкция — в `DEPLOY_FROM_ANDROID.md` внутри исходного архива.
