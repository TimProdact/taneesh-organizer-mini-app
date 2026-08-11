#!/usr/bin/env python3
"""YouGile → Telegram: уведомления о новых задачах и переносах со ссылкой.

Читает YOUGILE_* из .env в корне репо.
  python3 scripts/yougile-telegram-notify.py --init      # снимок без пушей
  python3 scripts/yougile-telegram-notify.py --once      # один проход
  python3 scripts/yougile-telegram-notify.py --watch     # каждые N сек
  python3 scripts/yougile-telegram-notify.py --announce  # тест-карточка + пуш на каждую доску
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / ".env"
STATE_PATH = ROOT / ".yougile-notify-state.json"
API = "https://ru.yougile.com/api-v2"

# YouGile user id / email → Telegram @username (без @ в значении тоже ок)
DEFAULT_TG_MAP = {
    "f2ead94b-0bdf-4fdb-9eea-72987bdc9749": "rauf_cc",  # Rauf
    "abduraufcoder@gmail.com": "rauf_cc",
    "81061eb1-1547-4004-9a21-3ff871b6aa26": "Marshall2221",  # Rashid
    "rashid.tadjiev@gmail.com": "Marshall2221",
}


def load_env() -> dict[str, str]:
    """`.env` + переменные окружения (GitHub Actions / Render). os.environ побеждает."""
    env: dict[str, str] = {}
    if ENV_PATH.exists():
        for line in ENV_PATH.read_text().splitlines():
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k] = v
    for k, v in os.environ.items():
        if k.startswith("YOUGILE_") and v:
            env[k] = v
    return env


def fetch_boards(headers: dict, project_id: str) -> dict:
    """Собирает {title: {id, columns: {colTitle: colId}}} из API."""
    r = requests.get(
        f"{API}/boards",
        headers=headers,
        params={"projectId": project_id, "limit": 50},
        timeout=30,
    )
    r.raise_for_status()
    out: dict = {}
    for b in r.json().get("content") or []:
        title = b.get("title") or ""
        bid = b["id"]
        cr = requests.get(
            f"{API}/columns",
            headers=headers,
            params={"boardId": bid, "limit": 50},
            timeout=30,
        )
        cr.raise_for_status()
        cols = {
            (c.get("title") or ""): c["id"]
            for c in cr.json().get("content") or []
            if c.get("id") and not c.get("deleted")
        }
        out[title] = {"id": bid, "columns": cols}
    return out


def resolve_boards(env: dict[str, str], headers: dict) -> dict:
    if env.get("YOUGILE_BOARDS_JSON"):
        boards = json.loads(env["YOUGILE_BOARDS_JSON"])
    elif env.get("YOUGILE_PROJECT_ID"):
        boards = fetch_boards(headers, env["YOUGILE_PROJECT_ID"])
    else:
        raise SystemExit(
            "Need YOUGILE_BOARDS_JSON or YOUGILE_PROJECT_ID"
        )
    allow = env.get("YOUGILE_NOTIFY_BOARDS", "*").strip()
    if allow and allow != "*":
        names = {n.strip() for n in allow.split(",") if n.strip()}
        boards = {k: v for k, v in boards.items() if k in names}
        if not boards:
            raise SystemExit(f"No boards match YOUGILE_NOTIFY_BOARDS={allow!r}")
        print(f"notify boards: {', '.join(boards)}")
    else:
        print(f"notify boards: ALL ({len(boards)})")
    return boards


def load_tg_map(env: dict[str, str]) -> dict[str, str]:
    m = dict(DEFAULT_TG_MAP)
    raw = env.get("YOUGILE_TG_USER_MAP")
    if raw:
        try:
            extra = json.loads(raw)
            if isinstance(extra, dict):
                m.update({str(k): str(v).lstrip("@") for k, v in extra.items()})
        except json.JSONDecodeError:
            print("warn: YOUGILE_TG_USER_MAP invalid JSON", file=sys.stderr)
    return m


def mentions_for(assigned: list | None, tg_map: dict[str, str]) -> list[str]:
    if not assigned:
        return []
    out: list[str] = []
    seen: set[str] = set()
    for uid in assigned:
        uname = tg_map.get(str(uid))
        if not uname or uname in seen:
            continue
        seen.add(uname)
        out.append(f"@{uname}")
    return out


def tg_send(token: str, chat_id: str, html: str) -> None:
    for attempt in range(6):
        r = requests.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={
                "chat_id": chat_id,
                "text": html,
                "parse_mode": "HTML",
                "disable_web_page_preview": True,
            },
            timeout=30,
        )
        if r.status_code == 429:
            retry = (r.json().get("parameters") or {}).get("retry_after") or 3
            time.sleep(float(retry) + 1)
            continue
        r.raise_for_status()
        data = r.json()
        if not data.get("ok"):
            raise RuntimeError(data)
        return
    raise RuntimeError("Telegram sendMessage failed after retries")


def task_link(company_id: str, task_id: str) -> str:
    # Официальный deep link YouGile (см. конфигуратор): хвосты id по 12 символов + #chat:
    company_tail = company_id[-12:]
    task_tail = task_id[-12:]
    return f"https://ru.yougile.com/team/{company_tail}/#chat:{task_tail}"


def list_column_tasks(headers: dict, column_id: str) -> list[dict]:
    out: list[dict] = []
    offset = 0
    while True:
        r = requests.get(
            f"{API}/tasks",
            headers=headers,
            params={"columnId": column_id, "limit": 50, "offset": offset},
            timeout=30,
        )
        r.raise_for_status()
        data = r.json()
        for t in data.get("content") or []:
            if t.get("deleted") or t.get("archived"):
                continue
            out.append(t)
        if not data.get("paging", {}).get("next"):
            break
        offset += 50
    return out


def html_to_text(html: str) -> str:
    import re
    from html import unescape

    s = html or ""
    s = re.sub(r"(?i)<br\s*/?>", "\n", s)
    s = re.sub(r"(?i)</p\s*>", "\n", s)
    s = re.sub(r"(?i)</li\s*>", "\n", s)
    s = re.sub(r"(?i)</h[1-6]\s*>", "\n", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = unescape(s)
    s = re.sub(r"[ \t]+\n", "\n", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()


def snapshot_boards(
    headers: dict, boards: dict, *, fetch_descriptions: bool = False
) -> dict[str, dict]:
    """task_id -> {board, column, columnId, title, code, assigned, description}"""
    snap: dict[str, dict] = {}
    for board_name, board in boards.items():
        for col_name, col_id in board["columns"].items():
            for t in list_column_tasks(headers, col_id):
                assigned = t.get("assigned") or []
                if not isinstance(assigned, list):
                    assigned = [assigned]
                desc = t.get("description") or ""
                if fetch_descriptions and not desc:
                    try:
                        full = requests.get(
                            f"{API}/tasks/{t['id']}", headers=headers, timeout=20
                        ).json()
                        desc = full.get("description") or ""
                        if full.get("assigned"):
                            assigned = full["assigned"]
                    except Exception:
                        pass
                snap[t["id"]] = {
                    "board": board_name,
                    "column": col_name,
                    "columnId": col_id,
                    "title": t.get("title") or "",
                    "code": t.get("idTaskProject") or "",
                    "assigned": [str(x) for x in assigned],
                    "description": desc,
                }
    return snap


def task_heading(title: str, code: str) -> str:
    name = escape_html(title)
    if code:
        return f"<b>{escape_html(code)}</b> · {name}"
    return f"<b>{name}</b>"


def format_notify_full(
    *,
    title: str,
    code: str,
    company_id: str,
    task_id: str,
    mentions: list[str] | None = None,
    description: str = "",
    board: str = "",
    column: str = "",
) -> str:
    lines = [
        "<b>Создание</b>",
        task_heading(title, code),
    ]
    if board:
        place = escape_html(board)
        if column:
            place += f" / {escape_html(column)}"
        lines.append(place)
    lines += [
        "",
        f"<b>Исполнитель:</b> {' '.join(mentions) if mentions else 'не назначен'}",
        "",
        "<b>Описание:</b>",
    ]
    body = html_to_text(description)
    if len(body) > 2800:
        body = body[:2800].rstrip() + "…"
    lines.append(escape_html(body) if body else "—")
    lines += ["", f'<a href="{task_link(company_id, task_id)}">Открыть в YouGile</a>']
    return "\n".join(lines)


def format_notify_action(
    *,
    action: str,
    title: str,
    code: str,
    company_id: str,
    task_id: str,
    board: str = "",
    detail: str = "",
) -> str:
    """Короткий пуш: действие + название + ссылка (перенос / удаление)."""
    lines = [
        f"<b>{escape_html(action)}</b>",
        task_heading(title, code),
    ]
    if board:
        lines.append(escape_html(board) + (f": {escape_html(detail)}" if detail else ""))
    elif detail:
        lines.append(escape_html(detail))
    lines += ["", f'<a href="{task_link(company_id, task_id)}">Открыть в YouGile</a>']
    return "\n".join(lines)


# backward-compat alias used by announce()
def format_notify(**kwargs):
    return format_notify_full(
        title=kwargs.get("title") or "",
        code=kwargs.get("code") or "",
        company_id=kwargs["company_id"],
        task_id=kwargs["task_id"],
        mentions=kwargs.get("mentions"),
        description=kwargs.get("description") or "",
        board=kwargs.get("board") or "",
        column=kwargs.get("column") or "",
    )


def escape_html(s: str) -> str:
    return (
        (s or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


STATE_SCHEMA = 3


def load_state() -> dict:
    if STATE_PATH.exists():
        try:
            state = json.loads(STATE_PATH.read_text())
        except json.JSONDecodeError:
            return {"schema": STATE_SCHEMA, "tasks": {}}
        if state.get("schema") != STATE_SCHEMA:
            # смена схемы (напр. Inbox → все доски) — переснимем без флуда
            print(
                f"state schema {state.get('schema')} → {STATE_SCHEMA}, will re-baseline",
                flush=True,
            )
            return {"schema": STATE_SCHEMA, "tasks": {}, "_rebaseline": True}
        return state
    return {"schema": STATE_SCHEMA, "tasks": {}}


def save_state(state: dict) -> None:
    state = dict(state)
    state["schema"] = STATE_SCHEMA
    state.pop("_rebaseline", None)
    STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n")


def entry_column(board: dict) -> tuple[str, str]:
    cols = board["columns"]
    for preferred in ("Нераспределённое", "Бэклог", "To Do"):
        if preferred in cols:
            return preferred, cols[preferred]
    name, cid = next(iter(cols.items()))
    return name, cid


def announce(env: dict, headers: dict, boards: dict) -> None:
    token = env["YOUGILE_TELEGRAM_BOT_TOKEN"]
    chat_id = env["YOUGILE_TELEGRAM_CHAT_ID"]
    company = env["YOUGILE_COMPANY_ID"]
    state = load_state()
    tasks_state = state.setdefault("tasks", {})

    for board_name, board in boards.items():
        col_name, col_id = entry_column(board)
        title = f"🔔 Telegram: уведомления со ссылками · {board_name}"
        r = requests.post(
            f"{API}/tasks",
            headers=headers,
            json={
                "title": title,
                "columnId": col_id,
                "description": (
                    "<p>Служебная карточка: для этой доски включены пуши в "
                    "@taneesh_yougile_bot со ссылкой на задачу.</p>"
                    "<p>Можно удалить после проверки.</p>"
                ),
            },
            timeout=30,
        )
        r.raise_for_status()
        tid = r.json()["id"]
        meta = requests.get(f"{API}/tasks/{tid}", headers=headers, timeout=20).json()
        code = meta.get("idTaskProject") or ""
        html = format_notify(
            title=title,
            code=code,
            company_id=company,
            task_id=tid,
            description=meta.get("description") or "",
            event="доска подключена",
            board=board_name,
            column=col_name,
        )
        tg_send(token, chat_id, html)
        tasks_state[tid] = {
            "board": board_name,
            "column": col_name,
            "columnId": col_id,
            "title": title,
            "code": code,
        }
        print(f"ok  {board_name} → {tid} ({code})")
        time.sleep(0.4)

    save_state(state)


def sync_once(env: dict, headers: dict, boards: dict, *, quiet_new: bool) -> int:
    token = env["YOUGILE_TELEGRAM_BOT_TOKEN"]
    chat_id = env["YOUGILE_TELEGRAM_CHAT_ID"]
    company = env["YOUGILE_COMPANY_ID"]
    tg_map = load_tg_map(env)
    state = load_state()
    if state.pop("_rebaseline", False):
        quiet_new = True
        print("re-baseline after schema change (no flood)", flush=True)
    prev = state.get("tasks") or {}
    # описания тянем только для новых карточек
    snap = snapshot_boards(headers, boards, fetch_descriptions=False)
    sent = 0

    for tid, info in snap.items():
        old = prev.get(tid)
        mentions = mentions_for(info.get("assigned"), tg_map)
        if old is None:
            if not quiet_new:
                desc = info.get("description") or ""
                if not desc:
                    try:
                        full = requests.get(
                            f"{API}/tasks/{tid}", headers=headers, timeout=20
                        ).json()
                        desc = full.get("description") or ""
                        if full.get("assigned"):
                            info["assigned"] = [str(x) for x in full["assigned"]]
                            mentions = mentions_for(info["assigned"], tg_map)
                    except Exception:
                        pass
                # Уже запушили из Telegram-бота — не дублировать
                if 'tg-bot-created' in (desc or ''):
                    print(
                        f"skip bot-created [{info['board']}] {info['title'][:50]}",
                        flush=True,
                    )
                    continue
                tg_send(
                    token,
                    chat_id,
                    format_notify_full(
                        title=info["title"],
                        code=info["code"],
                        company_id=company,
                        task_id=tid,
                        mentions=mentions,
                        description=desc,
                        board=info["board"],
                        column=info["column"],
                    ),
                )
                sent += 1
                print(
                    f"new  [{info['board']}/{info['column']}] {info['title'][:50]} {mentions}",
                    flush=True,
                )
            continue

        board_changed = old.get("board") != info["board"]
        moved = old.get("columnId") != info["columnId"] or board_changed
        if moved:
            detail = f"{old.get('column') or '?'} → {info['column']}"
            if board_changed:
                detail = (
                    f"{old.get('board')}/{old.get('column') or '?'} → "
                    f"{info['board']}/{info['column']}"
                )
            print(
                f"detect move {info.get('code')}: {detail}",
                flush=True,
            )
            tg_send(
                token,
                chat_id,
                format_notify_action(
                    action="Перенос",
                    title=info["title"],
                    code=info.get("code") or old.get("code") or "",
                    company_id=company,
                    task_id=tid,
                    board=info["board"],
                    detail=detail,
                ),
            )
            sent += 1
            print(
                f"move [{info['board']}] {info['title'][:50]}",
                flush=True,
            )

    # удаления: были в state, нет в текущем снимке
    for tid, old in prev.items():
        if tid in snap:
            continue
        if quiet_new:
            continue
        print(
            f"detect delete {old.get('code')}: {old.get('board')}/{old.get('column')}",
            flush=True,
        )
        tg_send(
            token,
            chat_id,
            format_notify_action(
                action="Удаление",
                title=old.get("title") or "без названия",
                code=old.get("code") or "",
                company_id=company,
                task_id=tid,
                board=old.get("board") or "",
                detail=old.get("column") or "",
            ),
        )
        sent += 1

    state["tasks"] = {
        tid: {
            "board": info["board"],
            "column": info["column"],
            "columnId": info["columnId"],
            "title": info["title"],
            "code": info["code"],
            "assigned": info.get("assigned") or [],
        }
        for tid, info in snap.items()
    }
    save_state(state)
    return sent


def main() -> int:
    parser = argparse.ArgumentParser()
    g = parser.add_mutually_exclusive_group(required=True)
    g.add_argument("--init", action="store_true", help="Снимок без уведомлений")
    g.add_argument("--once", action="store_true", help="Один проход")
    g.add_argument("--watch", action="store_true", help="Цикл")
    g.add_argument(
        "--announce",
        action="store_true",
        help="Создать тест-карточку и пуш на каждой доске",
    )
    parser.add_argument("--interval", type=int, default=45, help="Сек для --watch")
    args = parser.parse_args()

    env = load_env()
    for key in (
        "YOUGILE_API_KEY",
        "YOUGILE_COMPANY_ID",
        "YOUGILE_TELEGRAM_BOT_TOKEN",
        "YOUGILE_TELEGRAM_CHAT_ID",
    ):
        if not env.get(key):
            print(f"Missing {key} in .env / env", file=sys.stderr)
            return 1
    if not env.get("YOUGILE_BOARDS_JSON") and not env.get("YOUGILE_PROJECT_ID"):
        print("Missing YOUGILE_BOARDS_JSON or YOUGILE_PROJECT_ID", file=sys.stderr)
        return 1

    headers = {
        "Authorization": f"Bearer {env['YOUGILE_API_KEY']}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    boards = resolve_boards(env, headers)

    if args.init:
        n = sync_once(env, headers, boards, quiet_new=True)
        print(f"init ok, tracked {len(load_state().get('tasks', {}))} tasks, sent={n}")
        return 0

    if args.announce:
        # baseline first so old tasks don't flood
        sync_once(env, headers, boards, quiet_new=True)
        announce(env, headers, boards)
        return 0

    if args.once:
        n = sync_once(env, headers, boards, quiet_new=False)
        print(f"done, sent={n}")
        return 0

    print(f"watch every {args.interval}s · {len(boards)} boards")
    sync_once(env, headers, boards, quiet_new=True)
    print(f"baseline {len(load_state().get('tasks', {}))} tasks")
    while True:
        try:
            sync_once(env, headers, boards, quiet_new=False)
        except Exception as e:
            print(f"error: {e}", file=sys.stderr)
        time.sleep(args.interval)


if __name__ == "__main__":
    raise SystemExit(main())
