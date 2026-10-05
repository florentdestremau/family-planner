"""Script serveur deploy/server/family-env, avec un faux `once` qui journalise ses appels."""

import os
import subprocess
from pathlib import Path

import pytest

SCRIPT = Path(__file__).parents[2] / "deploy" / "server" / "family-env"
IMAGE = "ghcr.io/florentdestremau/family-planner:sha-abc1234"

FAKE_ONCE = """#!/usr/bin/env bash
echo "$*" >> "$ONCE_LOG"
case $1 in
  list) cat "$ONCE_APPS" 2>/dev/null || true ;;
  deploy) [[ -n ${ONCE_FAIL:-} ]] && exit 1; echo "$4 (running)" >> "$ONCE_APPS" ;;
  remove) sed -i "/^$2 /d" "$ONCE_APPS" ;;
esac
"""


@pytest.fixture
def env(tmp_path: Path):
    once = tmp_path / "once"
    once.write_text(FAKE_ONCE)
    once.chmod(0o755)
    variables = {
        **os.environ,
        "ONCE": str(once),
        "FP_HOME": str(tmp_path / "home"),
        "ONCE_LOG": str(tmp_path / "log"),
        "ONCE_APPS": str(tmp_path / "apps"),
    }

    def run(*args: str, ci: str | None = None, **extra: str) -> subprocess.CompletedProcess:
        e = {**variables, **extra}
        if ci is not None:
            e["SSH_ORIGINAL_COMMAND"] = ci
            args = ("ci",)
        return subprocess.run([str(SCRIPT), *args], env=e, capture_output=True, text=True)

    def calls() -> list[str]:
        log = tmp_path / "log"
        return log.read_text().splitlines() if log.exists() else []

    run.calls = calls
    run.home = tmp_path / "home"
    return run


def ok(r: subprocess.CompletedProcess) -> str:
    assert r.returncode == 0, r.stderr
    return r.stdout


def test_create_pr_with_fixtures(env) -> None:
    out = ok(env("create", "pr-12", "--image", IMAGE))
    assert "https://family-planning-pr-12.once.florent.cc" in out
    deploy = [c for c in env.calls() if c.startswith("deploy")]
    assert deploy == [f"deploy {IMAGE} --host family-planning-pr-12.once.florent.cc --memory 256 --auto-update=false --env FIXTURES=true"]
    assert (env.home / "envs" / "pr-12.meta").read_text().startswith("HOST=family-planning-pr-12.once.florent.cc\nIMAGE=" + IMAGE)


def test_create_production_has_backups_and_no_fixtures(env) -> None:
    ok(env("create", "production", "--image", IMAGE))
    deploy = next(c for c in env.calls() if c.startswith("deploy"))
    assert "--host family-planning.once.florent.cc" in deploy and "--auto-backup" in deploy and "--memory 512" in deploy
    assert "FIXTURES" not in deploy
    assert (env.home / "backups" / "production").is_dir()


def test_create_twice_is_refused(env) -> None:
    ok(env("create", "pr-1", "--image", IMAGE))
    r = env("create", "pr-1", "--image", IMAGE)
    assert r.returncode == 1 and "existe déjà" in r.stderr


def test_failed_deploy_leaves_nothing(env) -> None:
    r = env("create", "pr-1", "--image", IMAGE, ONCE_FAIL="1")
    assert r.returncode == 1
    assert not (env.home / "envs" / "pr-1.meta").exists()


def test_pr_limit(env) -> None:
    for n in range(1, 5):
        ok(env("create", f"pr-{n}", "--image", IMAGE))
    r = env("create", "pr-5", "--image", IMAGE)
    assert r.returncode == 1 and "au plus 4" in r.stderr
    ok(env("create", "production", "--image", IMAGE))  # la production ne compte pas


@pytest.mark.parametrize("name", ["staging", "pr-", "pr-abc", "pr-1;rm", "../pr-1", ""])
def test_invalid_names(env, name) -> None:
    r = env("create", name, "--image", IMAGE)
    assert r.returncode != 0
    assert not any(c.startswith("deploy") for c in env.calls())


def test_update_and_reset(env) -> None:
    ok(env("create", "pr-3", "--image", IMAGE))
    new = IMAGE.replace("abc1234", "def5678")
    ok(env("update", "pr-3", "--image", new))
    assert env.calls()[-1] == f"update family-planning-pr-3.once.florent.cc --image {new} --env FIXTURES=true"
    assert f"IMAGE={new}" in (env.home / "envs" / "pr-3.meta").read_text()
    ok(env("update", "pr-3", "--image", IMAGE, "--reset-db"))
    assert "remove family-planning-pr-3.once.florent.cc --remove-data" in env.calls()
    assert env.calls()[-1].startswith(f"deploy {IMAGE} --host family-planning-pr-3")


def test_update_unknown_env(env) -> None:
    r = env("update", "pr-9", "--image", IMAGE)
    assert r.returncode == 1 and "n'existe pas" in r.stderr


def test_production_is_protected(env) -> None:
    ok(env("create", "production", "--image", IMAGE))
    assert env("update", "production", "--image", IMAGE, "--reset-db").returncode == 1
    assert env("remove", "production").returncode == 1
    assert not any("remove" in c for c in env.calls())
    ok(env("remove", "production", "--confirm", "production"))
    assert "remove family-planning.once.florent.cc --remove-data" in env.calls()


def test_list_and_sweep(env) -> None:
    for name in ["pr-1", "pr-2", "pr-3", "production"]:
        ok(env("create", name, "--image", IMAGE))
    listing = ok(env("list"))
    assert listing.count("running") == 4 and "https://family-planning-pr-2.once.florent.cc" in listing
    out = ok(env("sweep", "--keep", "pr-2"))
    assert "2 environnement(s) supprimé(s)" in out
    remaining = sorted(p.stem for p in (env.home / "envs").glob("*.meta"))
    assert remaining == ["pr-2", "production"]
    ok(env("sweep", "--keep"))
    assert sorted(p.stem for p in (env.home / "envs").glob("*.meta")) == ["production"]
    assert env("sweep", "--keep", "production").returncode == 1


# (environnements à créer d'abord, commande de la CI)
ALLOWED = [
    ([], "list"),
    ([], f"create pr-4 --image {IMAGE}"),
    ([], f"family-planner/family-env create pr-4 --image {IMAGE}"),
    (["pr-4"], f"update pr-4 --image {IMAGE}"),
    (["pr-4"], f"update pr-4 --image {IMAGE} --reset-db"),
    (["production"], f"update production --image {IMAGE}"),
    (["pr-4"], "remove pr-4"),
    (["pr-1", "pr-3"], "sweep --keep pr-1,pr-2"),
    ([], "sweep --keep"),
]

REFUSED = [
    "",
    "setup",
    "remove production",
    "remove production --confirm production",
    f"update production --image {IMAGE} --reset-db",
    "create pr-4 --image evil.io/x:latest",
    "create pr-4 --image ghcr.io/florentdestremau/family-planner:master",
    f"create production --image {IMAGE}",
    f"create pr-4 --image {IMAGE} --extra",
    "logs production --follow",
    "list; rm -rf ~",
    f"create pr-4 --image {IMAGE};id",
]


@pytest.mark.parametrize(("existing", "command"), ALLOWED, ids=[c for _, c in ALLOWED])
def test_ci_allowed(env, existing, command) -> None:
    for name in existing:
        ok(env("create", name, "--image", IMAGE))
    ok(env(ci=command))


@pytest.mark.parametrize("command", REFUSED)
def test_ci_refused(env, command) -> None:
    before = env.calls()
    r = env(ci=command)
    assert r.returncode == 1 and "refusée à la CI" in r.stderr
    assert env.calls() == before, "rien n'a été exécuté"
