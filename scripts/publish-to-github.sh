#!/usr/bin/env bash
# ============================================================
# Публикация проекта «restaurant-simulator» на GitHub
# ============================================================
# Способ 1 (токен):
#   GITHUB_TOKEN=ghp_xxxxxxxxxxxx bash scripts/publish-to-github.sh
#   (токен с правом repo: https://github.com/settings/tokens)
#
# Способ 2 (gh CLI, уже установлен в ~/.local/bin):
#   export PATH="$HOME/.local/bin:$PATH"
#   gh auth login            # один раз: paste token / браузер
#   bash scripts/publish-to-github.sh
#
# Необязательные переменные окружения:
#   GH_REPO       имя репозитория      (по умолчанию: restaurant-simulator)
#   GH_PRIVATE    true|false           (по умолчанию: true — приватный)
#   GH_NAME       имя автора коммита   (напр. "Ivan Ivanov")
#   GH_EMAIL      email автора         (напр. "ivan@users.noreply.github.com")
#   GH_DESCRIPTION описание репозитория
# ============================================================
set -euo pipefail

GH_REPO="${GH_REPO:-restaurant-simulator}"
GH_PRIVATE="${GH_PRIVATE:-true}"
GH_DESCRIPTION="${GH_DESCRIPTION:-Экономический симулятор ресторана — браузерная обучающая управленческая игра (Москва, casual dining, 52 недели)}"

cd "$(dirname "$0")/.."

echo "==> Репозиторий: $GH_REPO (private=$GH_PRIVATE)"
echo "==> Текущая ветка: $(git branch --show-current), коммитов: $(git rev-list --count HEAD)"

# --- 0. Опциональная перезапись автора initial-коммита -----------------
if [[ -n "${GH_NAME:-}" && -n "${GH_EMAIL:-}" ]]; then
  echo "==> Перезаписываю автора коммита: $GH_NAME <$GH_EMAIL>"
  git commit --amend --no-edit --author="$GH_NAME <$GH_EMAIL>" >/dev/null
fi

# --- 1. Определяем способ аутентификации --------------------------------
GH_BIN="$(command -v gh || true)"
if [[ -x "$HOME/.local/bin/gh" ]]; then GH_BIN="$HOME/.local/bin/gh"; fi

AUTH_MODE=""
if [[ -n "${GITHUB_TOKEN:-}" ]]; then
  AUTH_MODE="token"
elif [[ -n "$GH_BIN" ]] && "$GH_BIN" auth status >/dev/null 2>&1; then
  AUTH_MODE="gh"
else
  cat <<'EOF'
❌ Аутентификация не найдена. Выберите один из вариантов:

Вариант A — токен (просто):
  1. Создайте токен: https://github.com/settings/tokens → Generate new token (classic)
     с правом scope «repo».
  2. Запустите:
     GITHUB_TOKEN=ваш_токен bash scripts/publish-to-github.sh

Вариант B — gh CLI:
  export PATH="$HOME/.local/bin:$PATH"
  gh auth login        # выбрать GitHub.com → HTTPS → Paste token
  bash scripts/publish-to-github.sh
EOF
  exit 1
fi

# --- 2. Определяем владельца -------------------------------------------
if [[ "$AUTH_MODE" == "token" ]]; then
  OWNER="$(curl -s -H "Authorization: Bearer $GITHUB_TOKEN" https://api.github.com/user | grep '"login"' | head -1 | sed 's/.*"login": *"\([^"]*\)".*/\1/')"
  if [[ -z "$OWNER" || "$OWNER" == "null" ]]; then
    echo "❌ Не удалось получить имя пользователя по токену (проверьте токен)."; exit 1
  fi
else
  OWNER="$("$GH_BIN" api user --jq .login)"
fi
echo "==> Аккаунт GitHub: $OWNER"

# --- 3. Создаём репозиторий (если ещё нет) -----------------------------
REPO_URL="https://github.com/$OWNER/$GH_REPO.git"
if git ls-remote "$REPO_URL" >/dev/null 2>&1; then
  echo "==> Репозиторий уже существует, использую его: $REPO_URL"
else
  echo "==> Создаю репозиторий $OWNER/$GH_REPO ..."
  if [[ "$AUTH_MODE" == "token" ]]; then
    HTTP_CODE="$(curl -s -o /tmp/gh-create.json -w '%{http_code}' -X POST \
      -H "Authorization: Bearer $GITHUB_TOKEN" -H "Accept: application/vnd.github+json" \
      https://api.github.com/user/repos \
      -d "{\"name\":\"$GH_REPO\",\"description\":\"$GH_DESCRIPTION\",\"private\":$GH_PRIVATE}")"
    if [[ "$HTTP_CODE" != "201" && "$HTTP_CODE" != "202" ]]; then
      echo "❌ Ошибка создания репозитория (HTTP $HTTP_CODE):"; cat /tmp/gh-create.json; exit 1
    fi
  else
    VIS="$([[ "$GH_PRIVATE" == "true" ]] && echo "--private" || echo "--public")"
    "$GH_BIN" repo create "$GH_REPO" $VIS --description "$GH_DESCRIPTION" >/dev/null
  fi
fi

# --- 4. Подключаем remote и пушим --------------------------------------
if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$REPO_URL"
else
  git remote add origin "$REPO_URL"
fi

PUSH_URL="$REPO_URL"
if [[ "$AUTH_MODE" == "token" ]]; then
  PUSH_URL="https://x-access-token:${GITHUB_TOKEN}@github.com/$OWNER/$GH_REPO.git"
  git push "$PUSH_URL" main
  git remote set-url origin "$REPO_URL"   # затираем токен из remote
  echo "==> Пуш выполнен, токен не сохранён в конфиге git."
else
  git push -u origin main
fi

echo ""
echo "✅ Готово: https://github.com/$OWNER/$GH_REPO"
