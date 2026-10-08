#!/usr/bin/env python3
"""Durable local task ledger. Native Codex chats are created by the master.

Only explicit CLI operations change Git. The master checkout is never switched.
No push, reset, clean, or production update runs. SQLite is authoritative.
"""
import argparse
import contextlib
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import sqlite3
import subprocess
import sys
import tempfile
import time
import uuid
from urllib.parse import urlparse


STATES = set("CREATED QUEUED PLANNING AWAITING_APPROVAL APPROVED IMPLEMENTING TESTING READY_FOR_INTEGRATION INTEGRATING INTEGRATED BLOCKED PAUSED CANCELLED".split())
ACTIVE = {"PLANNING", "IMPLEMENTING", "TESTING"}
TRANSITIONS = {
    "CREATED": {"QUEUED", "PLANNING"}, "QUEUED": {"PLANNING"},
    "PLANNING": {"AWAITING_APPROVAL"}, "AWAITING_APPROVAL": {"PLANNING", "APPROVED", "QUEUED"},
    "APPROVED": {"IMPLEMENTING", "AWAITING_APPROVAL"},
    "IMPLEMENTING": {"TESTING", "AWAITING_APPROVAL"},
    "TESTING": {"IMPLEMENTING", "READY_FOR_INTEGRATION", "AWAITING_APPROVAL"},
    "READY_FOR_INTEGRATION": {"IMPLEMENTING", "INTEGRATING", "AWAITING_APPROVAL"},
    "INTEGRATING": {"INTEGRATED"}, "BLOCKED": {"QUEUED", "PLANNING", "APPROVED", "IMPLEMENTING"},
    "PAUSED": {"QUEUED", "PLANNING", "APPROVED", "IMPLEMENTING"}, "INTEGRATED": set(), "CANCELLED": set(),
}
DEFAULT_CHECKS = [["npm", "run", "typecheck"], ["npm", "test"], ["npm", "run", "build"], ["npm", "run", "test:ui-regression"]]


class Error(RuntimeError):
    pass


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def digest(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def read_text(path):
    # Preserve CRLF in original requests rather than universal-newline conversion.
    with open(path, encoding="utf-8", newline="") as handle:
        return handle.read()


def atomic(path, text):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=".write-", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as handle:
            handle.write(text)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
        directory_fd = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


class Coordinator:
    def __init__(self, root):
        self.root = Path(root).resolve()
        self.home = self.root / ".codex-orchestrator"
        self.state = self.home / "state"
        self.state.mkdir(parents=True, exist_ok=True)
        self.db = self.state / "ledger.sqlite3"
        self.config = {"max_concurrency": 3, "checks": DEFAULT_CHECKS, "port_start": 42000, "port_count": 20000, "check_timeout_seconds": 1800}
        config = self.home / "config.json"
        if config.exists():
            self.config.update(json.loads(read_text(config)))
        if not isinstance(self.config["max_concurrency"], int) or self.config["max_concurrency"] < 1:
            raise Error("max_concurrency must be a positive integer")
        if not all(isinstance(self.config[key], int) and self.config[key] > 0 for key in ("port_start", "port_count")) or self.config["port_start"] + self.config["port_count"] > 65536:
            raise Error("port_start and port_count must describe valid TCP ports")
        checks = self.config["checks"]
        if not checks or any(not isinstance(c, list) or not c or any(not isinstance(v, str) or not v for v in c) for c in checks):
            raise Error("checks must contain nonempty argv arrays")
        with self.transaction() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS tasks (n INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE, data TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS integrations (n INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE, data TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS events (n INTEGER PRIMARY KEY AUTOINCREMENT, subject TEXT NOT NULL, at TEXT NOT NULL, kind TEXT NOT NULL, data TEXT NOT NULL);
            """)

    @contextlib.contextmanager
    def transaction(self):
        db = sqlite3.connect(self.db, timeout=60, isolation_level=None)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA busy_timeout=60000")
        db.execute("PRAGMA synchronous=FULL")
        db.execute("BEGIN IMMEDIATE")
        try:
            yield db
            db.commit()
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()

    @contextlib.contextmanager
    def operation(self, subject):
        if not re.fullmatch(r"ARC-(?:INTEGRATION-)?[0-9]+", subject):
            raise Error("Invalid task identifier")
        path = self.state / "locks" / (subject + ".lock")
        path.parent.mkdir(exist_ok=True)
        with path.open("a") as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise Error("Another operation is executing for " + subject)
            yield

    def git(self, *args, cwd=None, check=True):
        command = ["git", "-C", str(cwd or self.root), *args]
        result = subprocess.run(command, text=True, capture_output=True)
        if check and result.returncode:
            raise Error("git " + " ".join(args) + ": " + result.stderr.strip())
        return result.stdout.strip() if check else result

    def event(self, db, subject, kind, data):
        db.execute("INSERT INTO events(subject,at,kind,data) VALUES(?,?,?,?)", (subject, now(), kind, json.dumps(data, ensure_ascii=False)))

    def get(self, task_id, db=None, table="tasks"):
        if db is None:
            with self.transaction() as db:
                return self.get(task_id, db, table)
        row = db.execute(f"SELECT data FROM {table} WHERE id=?", (task_id,)).fetchone()
        if not row:
            raise Error("Unknown " + task_id)
        return json.loads(row["data"])

    def all(self, db=None, table="tasks"):
        if db is None:
            with self.transaction() as db:
                return self.all(db, table)
        return [json.loads(row[0]) for row in db.execute(f"SELECT data FROM {table} ORDER BY n")]

    def save(self, db, task, kind, detail=None, table="tasks"):
        task["updated_at"] = now()
        db.execute(f"UPDATE {table} SET data=? WHERE id=?", (json.dumps(task, ensure_ascii=False), task["id"]))
        self.event(db, task["id"], kind, detail if detail is not None else {"status": task["status"]})
        self.materialize(task, table)
        return task

    def materialize(self, task, table="tasks"):
        directory = self.home / ("tasks" if table == "tasks" else "integrations") / task["id"]
        atomic(directory / "STATUS.md", "# " + task["id"] + "\n\n```json\n" + json.dumps(task, ensure_ascii=False, indent=2) + "\n```\n")
        if table == "tasks":
            atomic(directory / "REQUEST.txt", task["request"])
            atomic(directory / "TASK.md", "# " + task["id"] + " — " + task["title"] + "\n\nBranch: `" + task["branch"] + "`\n\nOriginal request is preserved verbatim in REQUEST.txt.\n\n" + task["request"])
            if "plan" in task and not (directory / "PLAN.md").exists():
                atomic(directory / "PLAN.md", task["plan"])

    def set_status(self, task, target):
        source = task["status"]
        if target == source:
            return
        allowed = TRANSITIONS[source] | ({"BLOCKED", "PAUSED", "CANCELLED"} if source not in {"INTEGRATED", "CANCELLED", "INTEGRATING"} else set())
        if target not in allowed:
            raise Error(f"Invalid transition {source} -> {target}")
        task["status"] = target

    def register(self, title, request, slug, base="develop", dependencies=(), sample=False, resources=()):
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug):
            raise Error("slug must use lowercase letters, digits, and single hyphens")
        if not title.strip() or not request.strip():
            raise Error("title and request are required")
        with self.transaction() as db:
            for dependency in dependencies:
                self.get(dependency, db)
            n = db.execute("INSERT INTO tasks(data) VALUES('{}')").lastrowid
            task_id = f"ARC-{n:03d}"
            port = self.config["port_start"] + (n - 1) % self.config["port_count"]
            task = {"id": task_id, "title": title, "request": request, "original_request": request, "status": "CREATED", "branch": f"feature/{task_id.lower()}-{slug}", "base": base, "worktree": None, "session": None, "dependencies": list(dict.fromkeys(dependencies)), "resources": list(resources), "created_at": now(), "updated_at": now(), "approval": None, "validation": None, "sample": sample, "environment": {"port": port, "runtime_root": str(self.state / "runtime" / task_id)}}
            if sample:
                task["sample_manifest"] = {f"orchestrator-samples/{task_id}.txt": f"{task_id}: {title}\n"}
            db.execute("UPDATE tasks SET id=?,data=? WHERE n=?", (task_id, json.dumps(task), n))
            return self.save(db, task, "registered")

    def provision(self, task_id):
        with self.operation(task_id):
            table = "integrations" if task_id.startswith("ARC-INTEGRATION-") else "tasks"
            task = self.get(task_id, table=table)
            # Persist intent before touching Git. A failed Git operation cannot lose ID/request.
            if "base_sha" not in task:
                sha = self.git("rev-parse", "--verify", task["base"] + "^{commit}")
                with self.transaction() as db:
                    task = self.get(task_id, db, table)
                    task["base_sha"] = sha
                    self.save(db, task, "provision_intent", {"base_sha": sha}, table=table)
            existing = self.git("rev-parse", "--verify", "refs/heads/" + task["branch"], check=False)
            if existing.returncode:
                self.git("branch", task["branch"], task["base_sha"])
            elif not task.get("branch_provisioned") and existing.stdout.strip() != task["base_sha"]:
                raise Error("Unowned pre-existing branch differs from recorded base")
            with self.transaction() as db:
                task = self.get(task_id, db, table)
                task["branch_provisioned"] = True
                return self.save(db, task, "branch_provisioned", table=table)

    def verify_worktree(self, task, clean=False):
        if not task.get("worktree"):
            raise Error("No worktree bound")
        path = Path(task["worktree"]).resolve()
        if path == self.root:
            raise Error("Task cannot use the master checkout")
        actual = Path(self.git("rev-parse", "--show-toplevel", cwd=path)).resolve()
        if actual != path:
            raise Error("Path must be a Git worktree root")
        common = self.git("rev-parse", "--path-format=absolute", "--git-common-dir", cwd=path)
        expected = self.git("rev-parse", "--path-format=absolute", "--git-common-dir")
        if Path(common).resolve() != Path(expected).resolve():
            raise Error("Worktree belongs to a different Git repository")
        if self.git("branch", "--show-current", cwd=path) != task["branch"]:
            raise Error("Worktree is on the wrong branch")
        if clean and self.git("status", "--porcelain", "--untracked-files=all", cwd=path):
            raise Error("Worktree contains uncommitted or untracked changes")
        return self.git("rev-parse", "HEAD", cwd=path)

    def bind_worktree(self, task_id, path):
        with self.transaction() as db:
            table = "integrations" if task_id.startswith("ARC-INTEGRATION-") else "tasks"
            task = self.get(task_id, db, table)
            task["worktree"] = str(Path(path).resolve())
            # Native managed worktrees can begin detached. Attach only at the
            # existing task branch's exact commit, after checking repository identity.
            if not self.git("branch", "--show-current", cwd=path):
                common = self.git("rev-parse", "--path-format=absolute", "--git-common-dir", cwd=path)
                expected = self.git("rev-parse", "--path-format=absolute", "--git-common-dir")
                if Path(path).resolve() == self.root or Path(common).resolve() != Path(expected).resolve():
                    raise Error("Cannot attach a foreign or master worktree")
                if self.git("status", "--porcelain", "--untracked-files=all", cwd=path):
                    raise Error("Cannot attach a dirty detached worktree")
                if self.git("rev-parse", "HEAD", cwd=path) != self.git("rev-parse", task["branch"]):
                    raise Error("Detached HEAD does not match the task branch")
                self.git("switch", task["branch"], cwd=path)
            self.verify_worktree(task)
            if any(t["id"] != task_id and t.get("worktree") == task["worktree"] for t in self.all(db) + self.all(db, "integrations")):
                raise Error("Worktree is already assigned")
            return self.save(db, task, "worktree_bound", table=table)

    def prepare_worktree(self, task_id):
        self.provision(task_id)
        with self.operation(task_id):
            task = self.get(task_id, table="integrations" if task_id.startswith("ARC-INTEGRATION-") else "tasks")
            path = self.home / "worktrees" / task_id
            if not path.exists():
                path.parent.mkdir(parents=True, exist_ok=True)
                self.git("worktree", "add", str(path), task["branch"])
            return self.bind_worktree(task_id, path)

    def bind_session(self, task_id, thread_id, host_id, kind, evidence):
        if kind != "native" or not thread_id or thread_id not in evidence:
            raise Error("Native binding requires actual tool evidence containing thread_id")
        with self.transaction() as db:
            table = "integrations" if task_id.startswith("ARC-INTEGRATION-") else "tasks"
            task = self.get(task_id, db, table)
            task["session"] = {"thread_id": thread_id, "host_id": host_id, "kind": kind, "evidence": evidence, "bound_at": now(), "live_status": "UNVERIFIED"}
            return self.save(db, task, "session_bound", table=table)

    def capacity(self, db, task_id):
        return sum(t["status"] in ACTIVE or t.get("stop_pending", False) for t in self.all(db) if t["id"] != task_id) < self.config["max_concurrency"]

    def claim(self, task_id):
        with self.transaction() as db:
            task = self.get(task_id, db)
            if task["status"] == "PLANNING":
                return task
            if task["status"] not in {"CREATED", "QUEUED", "PAUSED", "BLOCKED", "AWAITING_APPROVAL", "APPROVED"}:
                raise Error("Task is not claimable for planning")
            if task.get("stop_pending"):
                raise Error("Previous execution must acknowledge stopping before resume")
            self.verify_worktree(task)
            if task["status"] in {"APPROVED", "AWAITING_APPROVAL"}:
                self.set_status(task, "AWAITING_APPROVAL")
                task.update(approval=None, validation=None)
                self.save(db, task, "replanning_requested")
            if not self.capacity(db, task_id):
                if task["status"] == "AWAITING_APPROVAL":
                    self.set_status(task, "QUEUED")
                if task["status"] != "QUEUED":
                    self.set_status(task, "QUEUED")
                return self.save(db, task, "capacity_queued")
            self.set_status(task, "PLANNING")
            return self.save(db, task, "planning_claimed", {"note": "Capacity reserved; session liveness requires native tool verification"})

    def save_plan(self, task_id, plan):
        if not plan.strip():
            raise Error("Plan cannot be empty")
        with self.transaction() as db:
            task = self.get(task_id, db)
            if task["status"] not in {"PLANNING", "AWAITING_APPROVAL", "APPROVED", "IMPLEMENTING", "TESTING", "READY_FOR_INTEGRATION"}:
                raise Error("Task is not accepting a plan")
            self.set_status(task, "AWAITING_APPROVAL")
            task.update(plan=plan, plan_sha256=digest(plan), approval=None, validation=None)
            atomic(self.home / "tasks" / task_id / "PLAN.md", plan)
            return self.save(db, task, "plan_saved", {"plan_sha256": task["plan_sha256"], "approval_invalidated": True})

    def plan_guard(self, task, approved=True):
        path = self.home / "tasks" / task["id"] / "PLAN.md"
        if not path.exists() or digest(read_text(path)) != task.get("plan_sha256"):
            raise Error("Plan file changed outside save-plan; submit it again for approval")
        if approved and (not task.get("approval") or task["approval"]["plan_sha256"] != task["plan_sha256"]):
            raise Error("Current plan has no matching human approval")

    def approve(self, task_id, evidence):
        if not evidence.strip():
            raise Error("Human approval evidence is required")
        with self.transaction() as db:
            task = self.get(task_id, db)
            if task["status"] != "AWAITING_APPROVAL":
                raise Error("Task must be awaiting approval")
            self.plan_guard(task, approved=False)
            task["approval"] = {"plan_sha256": task["plan_sha256"], "evidence": evidence, "at": now()}
            self.set_status(task, "APPROVED")
            return self.save(db, task, "human_approval_recorded")

    def dependencies_guard(self, task, db):
        for dependency in task["dependencies"]:
            if self.get(dependency, db)["status"] != "INTEGRATED":
                raise Error("Dependency is not integrated: " + dependency)

    def set_resources(self, task_id, resources, dependencies):
        with self.transaction() as db:
            task = self.get(task_id, db)
            if task["status"] not in {"CREATED", "QUEUED", "PLANNING", "AWAITING_APPROVAL", "APPROVED", "PAUSED", "BLOCKED"}:
                raise Error("Resources and dependencies must be declared before implementation")
            pending, seen = list(dependencies), set()
            while pending:
                dependency = pending.pop()
                if dependency == task_id:
                    raise Error("Dependency cycle")
                if dependency not in seen:
                    seen.add(dependency)
                    pending.extend(self.get(dependency, db)["dependencies"])
            task["resources"] = sorted(set(resources))
            task["dependencies"] = list(dict.fromkeys(dependencies))
            # Conflicts and dependency changes are part of the reviewed plan.
            if task["status"] == "APPROVED":
                self.set_status(task, "AWAITING_APPROVAL")
                task["approval"] = None
            return self.save(db, task, "resources_declared")

    def begin(self, task_id):
        with self.transaction() as db:
            task = self.get(task_id, db)
            resuming = task["status"] in {"PAUSED", "BLOCKED"} and task.get("status_before_stop") in {"IMPLEMENTING", "TESTING"}
            if task["status"] not in {"APPROVED", "TESTING", "READY_FOR_INTEGRATION"} and not resuming:
                raise Error("Task must be approved or returning from validation")
            if task.get("stop_pending"):
                raise Error("Previous execution must acknowledge stopping before resume")
            self.plan_guard(task)
            self.verify_worktree(task)
            self.dependencies_guard(task, db)
            if not self.capacity(db, task_id):
                raise Error("Execution capacity exhausted; keep approved task waiting")
            for other in self.all(db):
                if other["id"] == task_id or (other["status"] not in {"IMPLEMENTING", "TESTING"} and not other.get("stop_pending")):
                    continue
                conflicts = {a for a in task["resources"] for b in other["resources"] if a == b or a.startswith(b.rstrip("/") + "/") or b.startswith(a.rstrip("/") + "/")}
                if conflicts or task["environment"]["port"] == other["environment"]["port"]:
                    raise Error("Resource conflicts with " + other["id"] + ": " + ", ".join(sorted(conflicts)))
            self.set_status(task, "IMPLEMENTING")
            task["validation"] = None
            return self.save(db, task, "implementation_started")

    def transition(self, task_id, status, reason):
        # Guarded transitions cannot be reached through this administrative command.
        if status not in {"PAUSED", "BLOCKED", "CANCELLED", "QUEUED"} or not reason.strip():
            raise Error("transition supports PAUSED/BLOCKED/CANCELLED/QUEUED with a reason; use guarded commands for other states")
        with self.transaction() as db:
            task = self.get(task_id, db)
            if task["status"] in ACTIVE:
                task["stop_pending"] = True
                task["status_before_stop"] = task["status"]
            self.set_status(task, status)
            task["status_reason"] = reason
            return self.save(db, task, "administrative_transition", {"status": status, "reason": reason, "execution_stopped": False})

    def acknowledge_stop(self, task_id, evidence):
        proof = json.loads(evidence)
        if proof.get("task_id") != task_id or proof.get("stopped") is not True or not proof.get("evidence"):
            raise Error("Stop acknowledgement requires task_id, stopped:true, and observed execution evidence")
        with self.transaction() as db:
            task = self.get(task_id, db)
            task["stop_pending"] = False
            return self.save(db, task, "stop_acknowledged", proof)

    def set_sample_manifest(self, task_id, manifest):
        if not isinstance(manifest, dict) or not manifest or any(not isinstance(p, str) or not re.fullmatch(r"orchestrator-samples/[A-Za-z0-9_-]+\.txt", p) or not isinstance(v, str) for p, v in manifest.items()):
            raise Error("Sample manifest must map safe orchestrator-samples/*.txt paths to exact text")
        with self.transaction() as db:
            task = self.get(task_id, db)
            if not task["sample"] or task["status"] not in {"CREATED", "QUEUED", "PLANNING", "AWAITING_APPROVAL"}:
                raise Error("Declare sample manifest before approval")
            task["sample_manifest"] = manifest
            return self.save(db, task, "sample_manifest_declared")

    def sample_guard(self, task):
        manifest = task.get("sample_manifest")
        if not manifest:
            raise Error("Sample manifest required; declare exact fixture contents before approval")
        changed = set(self.git("diff", "--name-only", task["base_sha"], "HEAD", cwd=task["worktree"]).splitlines())
        if changed != set(manifest):
            raise Error("Sample changes must match only the declared fixture files")
        for name, content in manifest.items():
            path = Path(task["worktree"]) / name
            if path.is_symlink() or not path.is_file() or read_text(path) != content:
                raise Error("Sample fixture differs from declared content: " + name)

    def sample_checks(self, manifest):
        code = "from pathlib import Path; import json; manifest=json.loads(" + repr(json.dumps(manifest)) + "); "
        code += "assert all(Path(p).read_bytes()==v.encode('utf-8') for p,v in manifest.items()); print('Exact sample fixture contents verified')"
        return [[sys.executable, "-c", code]]

    def bind_environment(self, task_id, manifest):
        table = "integrations" if task_id.startswith("ARC-INTEGRATION-") else "tasks"
        with self.transaction() as db:
            task = self.get(task_id, db, table)
            self.environment_guard(task["worktree"])
            if not manifest.get("evidence") or Path(manifest.get("worktree", "")).resolve() != Path(task["worktree"]).resolve():
                raise Error("Environment manifest must identify assigned worktree and contain verification evidence")
            for key in ("KITCHEN_UI_BASE_URL", "PRICING_UI_BASE_URL"):
                url = urlparse(manifest.get(key, ""))
                if url.scheme != "http" or url.hostname not in {"127.0.0.1", "localhost"} or not url.port or url.port in {5180, 5191}:
                    raise Error("Use verified isolated loopback URLs on non-shared ports for " + key)
            task["verified_environment"] = manifest
            task["validation"] = None
            return self.save(db, task, "isolated_environment_verified", table=table)

    def execution_environment(self, task):
        self.environment_guard(task["worktree"])
        manifest = task.get("verified_environment")
        if not manifest:
            raise Error("TESTS NOT RUN: bind a verified isolated environment manifest; shared UI services are forbidden")
        if Path(manifest["worktree"]).resolve() != Path(task["worktree"]).resolve():
            raise Error("Environment verification belongs to another worktree")
        return {key: manifest[key] for key in ("KITCHEN_UI_BASE_URL", "PRICING_UI_BASE_URL")}

    def run_checks(self, subject, path, checks, sha, environment=None, verified_environment=None):
        run_id = uuid.uuid4().hex
        directory = self.home / "logs" / subject / run_id
        directory.mkdir(parents=True)
        result = {"id": run_id, "sha": sha, "started_at": now(), "status": "TESTS NOT RUN", "checks": [], "required_checks": checks}
        env = {key: value for key, value in os.environ.items() if key in {"PATH", "HOME", "LANG", "LC_ALL", "SYSTEMROOT"}}
        env.update(verified_environment or {})
        if environment:
            runtime = Path(environment["runtime_root"])
            for name in ("tmp", "storage", "outputs", "exports"):
                (runtime / name).mkdir(parents=True, exist_ok=True)
            env.update({"ARCIGY_TASK_RUNTIME": str(runtime), "PORT": str(environment["port"]), "TMPDIR": str(runtime / "tmp"), "STORAGE_ROOT": str(runtime / "storage")})
        atomic(directory / "result.json", json.dumps(result, indent=2))
        for index, argv in enumerate(checks):
            log = directory / f"{index + 1:02d}.log"
            code, outcome = None, "TESTS NOT RUN"
            with log.open("w") as output:
                try:
                    child = subprocess.Popen(argv, cwd=path, env=env, stdout=output, stderr=subprocess.STDOUT, start_new_session=True)
                    try:
                        deadline = time.monotonic() + self.config["check_timeout_seconds"]
                        while True:
                            remaining = deadline - time.monotonic()
                            if remaining <= 0:
                                raise subprocess.TimeoutExpired(argv, self.config["check_timeout_seconds"])
                            try:
                                code = child.wait(timeout=min(1, remaining))
                                break
                            except subprocess.TimeoutExpired:
                                if not subject.startswith("ARC-INTEGRATION-") and self.get(subject)["status"] in {"PAUSED", "CANCELLED", "BLOCKED"}:
                                    raise Error("Validation stopped after task pause/cancel/block request")
                    except BaseException:
                        try:
                            os.killpg(child.pid, signal.SIGTERM)
                            child.wait(timeout=5)
                        except subprocess.TimeoutExpired:
                            os.killpg(child.pid, signal.SIGKILL)
                            child.wait()
                        except ProcessLookupError:
                            pass
                        finally:
                            # Descendants may outlive the npm parent after SIGTERM.
                            try:
                                os.killpg(child.pid, signal.SIGKILL)
                            except ProcessLookupError:
                                pass
                        raise
                    outcome = "TESTS PASSED" if code == 0 else "TESTS FAILED"
                except FileNotFoundError as error:
                    output.write(str(error))
                    outcome = "TESTS NOT AVAILABLE"
                except subprocess.TimeoutExpired as error:
                    output.write(str(error))
                    outcome = "TESTS FAILED"
                except Error as error:
                    output.write(str(error))
                    outcome = "TESTS FAILED"
                    result["cancelled"] = True
            result["checks"].append({"argv": argv, "exit_code": code, "status": outcome, "log": str(log)})
            atomic(directory / "result.json", json.dumps(result, indent=2))
            if result.get("cancelled"):
                break
        result["status"] = "TESTS PASSED" if all(c["status"] == "TESTS PASSED" for c in result["checks"]) else "TESTS FAILED"
        result["finished_at"] = now()
        result["record_path"] = str(directory / "result.json")
        atomic(directory / "result.json", json.dumps(result, indent=2))
        return result

    def environment_guard(self, path):
        path = Path(path)
        for file in path.glob(".env*"):
            if file.name.endswith((".example", ".sample", ".template")):
                continue
            if file.is_symlink():
                raise Error("Environment symlink is unsafe for execution: " + file.name)
            if file.is_file() and any(re.match(r"\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=\s*\S", line) for line in read_text(file).splitlines() if not line.lstrip().startswith("#")):
                raise Error("Populated environment file blocks automatic execution: " + file.name + "; establish isolated fixtures before running application checks")
        for name in ("storage", "outputs", "exports", "tmp", "dist", "node_modules"):
            directory = path / name
            if directory.is_symlink() or (name != "node_modules" and directory.is_dir() and any(p.is_symlink() for p in directory.rglob("*"))):
                raise Error("Shared mutable path or symlink blocks checks: " + name)

    def validate(self, task_id):
        with self.operation(task_id):
            with self.transaction() as db:
                task = self.get(task_id, db)
                if task["status"] not in {"IMPLEMENTING", "TESTING"}:
                    raise Error("Validation requires IMPLEMENTING or TESTING")
                self.plan_guard(task)
                sha = self.verify_worktree(task, clean=True)
                if task["sample"]:
                    self.sample_guard(task)
                execution_environment = {} if task["sample"] else self.execution_environment(task)
                self.set_status(task, "TESTING")
                task["validation"] = {"status": "TESTS NOT RUN", "sha": sha}
                self.save(db, task, "validation_started")
            checks = self.sample_checks(task["sample_manifest"]) if task["sample"] else self.config["checks"]
            result = self.run_checks(task_id, task["worktree"], checks, sha, task["environment"], execution_environment)
            try:
                if self.verify_worktree(task, clean=True) != sha:
                    raise Error("HEAD changed during validation")
            except Error as error:
                result["status"] = "TESTS FAILED"
                result["postcheck_error"] = str(error)
            with self.transaction() as db:
                task = self.get(task_id, db)
                task["validation"] = result
                return self.save(db, task, "validation_finished", result)

    def ready_guard(self, task, db, integrating=False):
        allowed = {"READY_FOR_INTEGRATION", "INTEGRATING"} if integrating else {"TESTING", "READY_FOR_INTEGRATION"}
        if task["status"] not in allowed:
            raise Error("Task is not ready for integration: " + task["id"])
        self.plan_guard(task)
        self.dependencies_guard(task, db)
        sha = self.verify_worktree(task, clean=True)
        validation = task.get("validation") or {}
        checks = self.sample_checks(task["sample_manifest"]) if task["sample"] else self.config["checks"]
        if task["sample"]:
            self.sample_guard(task)
        if validation.get("status") != "TESTS PASSED" or validation.get("sha") != sha or validation.get("required_checks") != checks:
            raise Error("Passing required validation must match the exact current commit and configured checks")
        return sha

    def ready(self, task_id):
        with self.transaction() as db:
            task = self.get(task_id, db)
            sha = self.ready_guard(task, db)
            self.set_status(task, "READY_FOR_INTEGRATION")
            task["final_sha"] = sha
            return self.save(db, task, "ready_for_integration", {"sha": sha})

    def history(self, subject=None):
        with self.transaction() as db:
            rows = db.execute("SELECT * FROM events WHERE (? IS NULL OR subject=?) ORDER BY n", (subject, subject)).fetchall()
            return [{**dict(row), "data": json.loads(row["data"])} for row in rows]

    def overview(self):
        return [{
            "id": task["id"], "title": task["title"], "status": task["status"],
            "branch": task["branch"], "worktree": task["worktree"],
            "session": {key: task["session"].get(key) for key in ("thread_id", "host_id", "kind")} if task.get("session") else None,
            "dependencies": task["dependencies"], "approved": bool(task.get("approval")),
            "validation": (task.get("validation") or {}).get("status", "TESTS NOT RUN"),
            "commit_sha": task.get("final_sha"), "integration_id": task.get("integration_id"),
            "sample": task["sample"], "stop_pending": task.get("stop_pending", False),
        } for task in self.all()]

    def reconcile(self):
        findings = []
        for task in self.all():
            item = {"id": task["id"], "status": task["status"], "session_live_status": "UNVERIFIED; inspect native thread with read_thread/wait_threads", "issues": []}
            try:
                if task.get("worktree"):
                    item["head"] = self.verify_worktree(task)
                    item["dirty"] = bool(self.git("status", "--porcelain", "--untracked-files=all", cwd=task["worktree"]))
                if task.get("plan_sha256"):
                    self.plan_guard(task, approved=False)
                if task["status"] == "READY_FOR_INTEGRATION":
                    with self.transaction() as db:
                        self.ready_guard(task, db)
            except (Error, OSError) as error:
                item["issues"].append(str(error))
            findings.append(item)
        return {"tasks": findings, "integrations": self.all(table="integrations"), "note": "No PID or persisted session status is treated as live evidence"}

    def start_integration(self, task_ids, base="develop"):
        if not task_ids:
            task_ids = [t["id"] for t in self.all() if t["status"] == "READY_FOR_INTEGRATION" and not t["sample"]]
        if not task_ids or len(task_ids) != len(set(task_ids)):
            raise Error("Select unique ready tasks")
        base_sha = self.git("rev-parse", "--verify", base + "^{commit}")
        with self.transaction() as db:
            tasks = [self.get(i, db) for i in task_ids]
            if len({t["sample"] for t in tasks}) != 1:
                raise Error("Sample and production tasks cannot share an integration")
            manifests = {}
            for task in tasks:
                for name, content in task.get("sample_manifest", {}).items():
                    if name in manifests and manifests[name] != content:
                        raise Error("Sample tasks declare incompatible contents for " + name)
                    manifests[name] = content
            sources = [{"id": t["id"], "sha": self.ready_guard(t, db), "branch": t["branch"], "sample": t["sample"], "sample_manifest": t.get("sample_manifest", {}), "merged_sha": None, "validation": None} for t in tasks]
            n = db.execute("INSERT INTO integrations(data) VALUES('{}')").lastrowid
            identifier = f"ARC-INTEGRATION-{n:03d}"
            record = {"id": identifier, "status": "CREATED", "branch": f"integration/arc-integration-{n:03d}", "base": base, "base_sha": base_sha, "worktree": str(self.home / "worktrees" / identifier), "sources": sources, "created_at": now(), "updated_at": now(), "validation": None, "session": None}
            db.execute("UPDATE integrations SET id=?,data=? WHERE n=?", (identifier, json.dumps(record), n))
            self.save(db, record, "integration_registered", table="integrations")
            for task in tasks:
                self.set_status(task, "INTEGRATING")
                task["integration_id"] = identifier
                self.save(db, task, "integration_reserved", {"integration_id": identifier})
            return record

    def integration_save(self, record, event, detail=None):
        with self.transaction() as db:
            return self.save(db, record, event, detail, table="integrations")

    def integration_checks(self, record):
        sample = all(s["sample"] for s in record["sources"])
        manifest = {}
        for source in record["sources"]:
            if self.git("merge-base", "--is-ancestor", source["sha"], "HEAD", cwd=record["worktree"], check=False).returncode == 0:
                manifest.update(source.get("sample_manifest", {}))
        checks = self.sample_checks(manifest) if sample else self.config["checks"]
        sha = self.verify_worktree(record, clean=True)
        execution_environment = {} if sample else self.execution_environment(record)
        if sample:
            self.sample_guard({**record, "sample_manifest": manifest})
        result = self.run_checks(record["id"], record["worktree"], checks, sha, verified_environment=execution_environment)
        if self.verify_worktree(record, clean=True) != sha:
            result["status"] = "TESTS FAILED"
            result["postcheck_error"] = "Integration HEAD changed during checks"
        if result["status"] != "TESTS PASSED":
            record["validation"] = result
            self.integration_save(record, "integration_validation_failed", result)
            raise Error("Integration validation failed; logs and worktree preserved")
        return result

    def run_integration(self, integration_id):
        with self.operation(integration_id):
            record = self.get(integration_id, table="integrations")
            if record["status"] == "INTEGRATED":
                return record
            try:
                # Source changes after READY invalidate the integration even on resume.
                with self.transaction() as db:
                    for source in record["sources"]:
                        task = self.get(source["id"], db)
                        if self.ready_guard(task, db, integrating=True) != source["sha"]:
                            raise Error("Source SHA changed: " + source["id"])
                path = Path(record["worktree"])
                if not path.exists():
                    branch = self.git("rev-parse", "--verify", "refs/heads/" + record["branch"], check=False)
                    if branch.returncode:
                        self.git("branch", record["branch"], record["base_sha"])
                    elif branch.stdout.strip() != record["base_sha"]:
                        raise Error("Existing integration branch requires manual worktree binding")
                    path.parent.mkdir(parents=True, exist_ok=True)
                    self.git("worktree", "add", str(path), record["branch"])
                self.verify_worktree(record, clean=True)
                if self.git("rev-parse", "--verify", "MERGE_HEAD", cwd=path, check=False).returncode == 0:
                    raise Error("Unfinished merge preserved; resolve and commit it before resume")
                record["status"] = "INTEGRATING"
                record.pop("error", None)
                self.integration_save(record, "integration_resumed")
                checkpoint = f"refs/arcigy/checkpoints/{integration_id}/base"
                if self.git("rev-parse", "--verify", checkpoint, check=False).returncode:
                    self.git("update-ref", checkpoint, record["base_sha"])
                current_base = self.git("rev-parse", "--verify", record["base"] + "^{commit}")
                if current_base != record["base_sha"]:
                    self.git("merge", "--no-edit", current_base, cwd=path)
                    record["base_sha"] = current_base
                    record["validation"] = self.integration_checks(record)
                    self.integration_save(record, "base_revalidated")
                for source in record["sources"]:
                    already = self.git("merge-base", "--is-ancestor", source["sha"], "HEAD", cwd=path, check=False).returncode == 0
                    if not already:
                        before = self.verify_worktree(record, clean=True)
                        self.git("update-ref", f"refs/arcigy/checkpoints/{integration_id}/before-{source['id']}", before)
                        self.integration_save(record, "merge_intent", {"task": source["id"], "sha": source["sha"], "before": before})
                        self.git("merge", "--no-edit", "--no-ff", source["sha"], cwd=path)
                    head = self.verify_worktree(record, clean=True)
                    previous = source.get("validation") or {}
                    if source.get("merged_sha") != head or previous.get("status") != "TESTS PASSED":
                        source["merged_sha"] = head
                        source["validation"] = self.integration_checks(record)
                        self.integration_save(record, "source_merged_and_validated", {"task": source["id"], "sha": head, "recovered_existing_merge": already})
                record["validation"] = self.integration_checks(record)
                record["final_sha"] = self.verify_worktree(record, clean=True)
                record["status"] = "READY_FOR_PR"
                return self.integration_save(record, "integration_ready_for_pr")
            except (Error, OSError) as error:
                record["status"] = "BLOCKED"
                record["error"] = str(error)
                self.integration_save(record, "integration_blocked", {"error": str(error)})
                raise Error(f"{integration_id}: {error}")

    def finalize(self, integration_id, target_ref, evidence=""):
        with self.operation(integration_id):
            record = self.get(integration_id, table="integrations")
            if record["status"] == "INTEGRATED":
                return record
            if record["status"] != "READY_FOR_PR":
                raise Error("Integration is not validated and ready")
            sha = self.verify_worktree(record, clean=True)
            with self.transaction() as db:
                for source in record["sources"]:
                    if self.ready_guard(self.get(source["id"], db), db, integrating=True) != source["sha"]:
                        raise Error("Source changed after integration validation: " + source["id"])
            if sha != record.get("final_sha") or record["validation"]["sha"] != sha or record["validation"]["status"] != "TESTS PASSED":
                raise Error("Integration changed after validation")
            if self.git("rev-parse", record["base"] + "^{commit}") != record["base_sha"]:
                # A PR merge commit may differ from HEAD while retaining the tested tree.
                if target_ref != record["base"] or self.git("rev-parse", target_ref + "^{tree}") != self.git("rev-parse", sha + "^{tree}"):
                    raise Error("Base changed; resume integration and revalidate against latest base")
            disposable = all(s["sample"] for s in record["sources"]) and target_ref == record["branch"]
            if not disposable and (target_ref != record["base"] or not evidence.strip()):
                raise Error("Production finalization requires base target and verified merged-PR evidence")
            if self.git("merge-base", "--is-ancestor", sha, target_ref, check=False).returncode:
                raise Error("Validated integration is not present in target ref")
            with self.transaction() as db:
                for source in record["sources"]:
                    task = self.get(source["id"], db)
                    self.set_status(task, "INTEGRATED")
                    task["integrated_sha"] = sha
                    self.save(db, task, "integration_finalized", {"integration_id": integration_id, "target_ref": target_ref})
                record.update(status="INTEGRATED", target_ref=target_ref, completion_evidence=evidence or "Disposable sample integration only")
                return self.save(db, record, "integration_finalized", table="integrations")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", default=str(Path(__file__).resolve().parent.parent))
    sub = parser.add_subparsers(dest="command", required=True)
    register = sub.add_parser("register")
    for name in ("title", "request-file", "slug"):
        register.add_argument("--" + name, required=True)
    register.add_argument("--base", default="develop")
    register.add_argument("--dependency", action="append", default=[])
    register.add_argument("--resource", action="append", default=[])
    register.add_argument("--sample", action="store_true")
    for name in ("provision", "prepare-worktree", "claim", "begin", "validate", "ready", "show"):
        sub.add_parser(name).add_argument("id")
    bind = sub.add_parser("bind-worktree")
    bind.add_argument("id")
    bind.add_argument("path")
    session = sub.add_parser("bind-session")
    session.add_argument("id")
    for name in ("thread-id", "host-id", "evidence-file"):
        session.add_argument("--" + name, required=True)
    session.add_argument("--kind", choices=["native"], default="native")
    plan = sub.add_parser("save-plan")
    plan.add_argument("id")
    plan.add_argument("--file", required=True)
    approval = sub.add_parser("approve")
    approval.add_argument("id")
    approval.add_argument("--evidence-file", required=True)
    transition = sub.add_parser("transition")
    transition.add_argument("id")
    transition.add_argument("status", choices=sorted(STATES))
    transition.add_argument("--reason", required=True)
    resources = sub.add_parser("set-resources")
    resources.add_argument("id")
    resources.add_argument("--resource", action="append", default=[])
    resources.add_argument("--dependency", action="append", default=[])
    for name in ("set-sample-manifest", "bind-environment"):
        item = sub.add_parser(name)
        item.add_argument("id")
        item.add_argument("--file", required=True)
    stopped = sub.add_parser("ack-stop")
    stopped.add_argument("id")
    stopped.add_argument("--evidence-file", required=True)
    sub.add_parser("list").add_argument("--full", action="store_true")
    sub.add_parser("reconcile")
    sub.add_parser("history").add_argument("id", nargs="?")
    integrate = sub.add_parser("integrate")
    integrate.add_argument("ids", nargs="*")
    integrate.add_argument("--base", default="develop")
    integrate.add_argument("--resume")
    start = sub.add_parser("start-integration")
    start.add_argument("ids", nargs="*")
    start.add_argument("--base", default="develop")
    finalize = sub.add_parser("finalize")
    finalize.add_argument("id")
    finalize.add_argument("--target-ref", required=True)
    finalize.add_argument("--evidence-file")
    args = parser.parse_args()
    try:
        coordinator = Coordinator(args.root)
        command = args.command
        if command == "register":
            result = coordinator.register(args.title, read_text(args.request_file), args.slug, args.base, args.dependency, args.sample, args.resource)
        elif command in {"provision", "prepare-worktree", "claim", "begin", "validate", "ready"}:
            result = getattr(coordinator, command.replace("-", "_"))(args.id)
        elif command == "show":
            result = coordinator.get(args.id, table="integrations" if args.id.startswith("ARC-INTEGRATION-") else "tasks")
        elif command == "bind-worktree":
            result = coordinator.bind_worktree(args.id, args.path)
        elif command == "bind-session":
            result = coordinator.bind_session(args.id, args.thread_id, args.host_id, args.kind, read_text(args.evidence_file))
        elif command == "save-plan":
            result = coordinator.save_plan(args.id, read_text(args.file))
        elif command == "approve":
            result = coordinator.approve(args.id, read_text(args.evidence_file))
        elif command == "transition":
            result = coordinator.transition(args.id, args.status, args.reason)
        elif command == "set-resources":
            result = coordinator.set_resources(args.id, args.resource, args.dependency)
        elif command in {"set-sample-manifest", "bind-environment"}:
            result = getattr(coordinator, command.replace("-", "_"))(args.id, json.loads(read_text(args.file)))
        elif command == "ack-stop":
            result = coordinator.acknowledge_stop(args.id, read_text(args.evidence_file))
        elif command == "list":
            result = coordinator.all() if args.full else coordinator.overview()
        elif command == "reconcile":
            result = coordinator.reconcile()
        elif command == "history":
            result = coordinator.history(args.id)
        elif command == "integrate":
            identifier = args.resume or coordinator.start_integration(args.ids, args.base)["id"]
            result = coordinator.run_integration(identifier)
        elif command == "start-integration":
            result = coordinator.start_integration(args.ids, args.base)
        elif command == "finalize":
            result = coordinator.finalize(args.id, args.target_ref, read_text(args.evidence_file) if args.evidence_file else "")
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (Error, OSError, ValueError, sqlite3.Error) as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
