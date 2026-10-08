"""All Git mutations in this suite occur in disposable temporary repositories."""
import concurrent.futures
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location("arcigy_coordinator", Path(__file__).with_name("coordinator.py"))
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
Coordinator, Error = MODULE.Coordinator, MODULE.Error


class CoordinatorTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="arcigy-coordinator-test-")
        self.root = Path(self.temporary.name)
        self.git("init", "-b", "develop")
        self.git("config", "user.email", "test@example.invalid")
        self.git("config", "user.name", "Orchestrator test")
        (self.root / ".gitignore").write_text(".codex-orchestrator/\n")
        (self.root / "README.md").write_text("Disposable fixture\n")
        self.git("add", ".gitignore", "README.md")
        self.git("commit", "-m", "test: initialize disposable fixture")
        self.c = Coordinator(self.root)

    def tearDown(self):
        self.temporary.cleanup()

    def git(self, *args, cwd=None):
        return subprocess.run(["git", "-C", str(cwd or self.root), *args], check=True, capture_output=True, text=True).stdout.strip()

    def task(self, slug="example", sample=True, dependencies=(), resources=()):
        task = self.c.register(slug, "Original\r\nrequest without normalization\r\n", slug, sample=sample, dependencies=dependencies, resources=resources)
        task = self.c.prepare_worktree(task["id"])
        if not sample:
            self.bind_environment(task)
        return task

    def bind_environment(self, task):
        return self.c.bind_environment(task["id"], {"worktree": task["worktree"], "KITCHEN_UI_BASE_URL": "http://127.0.0.1:62001", "PRICING_UI_BASE_URL": "http://127.0.0.1:62001", "evidence": "Unit test invokes only local Python, no application or service"})

    def approved(self, task):
        self.assertEqual(self.c.claim(task["id"])["status"], "PLANNING")
        self.c.save_plan(task["id"], "Implement only a disposable text file.\n")
        return self.c.approve(task["id"], "User explicitly approves the harmless installation test.")

    def completed(self, slug="example", content=None):
        task = self.task(slug)
        self.approved(task)
        self.c.begin(task["id"])
        path = Path(task["worktree"])
        for name, expected in task["sample_manifest"].items():
            (path / name).parent.mkdir(parents=True, exist_ok=True)
            (path / name).write_text(expected)
            self.git("add", name, cwd=path)
        self.git("commit", "-m", "test: " + slug, cwd=path)
        self.assertEqual(self.c.validate(task["id"])["validation"]["status"], "TESTS PASSED")
        return self.c.ready(task["id"])

    def test_concurrent_ids_and_verbatim_request(self):
        request = self.root / "request.txt"
        request.write_bytes("Žiadosť\r\n\r\nPresná.\n".encode())
        command = [sys.executable, str(Path(__file__).with_name("coordinator.py")), "--root", str(self.root), "register", "--title", "Parallel", "--request-file", str(request), "--slug", "parallel"]
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(lambda _: subprocess.run(command, capture_output=True, text=True), range(12)))
        self.assertTrue(all(p.returncode == 0 for p in results), [p.stderr for p in results])
        ids = {json.loads(p.stdout)["id"] for p in results}
        self.assertEqual(ids, {f"ARC-{i:03d}" for i in range(1, 13)})
        reopened = Coordinator(self.root)
        self.assertEqual(len(reopened.all()), 12)
        self.assertEqual((self.c.home / "tasks/ARC-001/REQUEST.txt").read_bytes(), request.read_bytes())

    def test_atomic_capacity_and_resume(self):
        self.c.config["max_concurrency"] = 1
        one, two = self.task("one"), self.task("two")
        self.assertEqual(self.c.claim(one["id"])["status"], "PLANNING")
        self.assertEqual(self.c.claim(two["id"])["status"], "QUEUED")
        self.c.save_plan(one["id"], "A plan releases the execution slot.")
        self.assertEqual(self.c.claim(two["id"])["status"], "PLANNING")
        self.assertGreater(len(self.c.history()), 5)

    def test_plan_approval_hash_and_no_transition_bypass(self):
        task = self.task()
        self.approved(task)
        (self.c.home / "tasks" / task["id"] / "PLAN.md").write_text("Unapproved replacement")
        with self.assertRaisesRegex(Error, "changed outside"):
            self.c.begin(task["id"])
        self.c.save_plan(task["id"], "New plan")
        self.assertIsNone(self.c.get(task["id"])["approval"])
        with self.assertRaises(Error):
            self.c.begin(task["id"])
        with self.assertRaises(Error):
            self.c.transition(task["id"], "IMPLEMENTING", "Bypass")

    def test_wrong_worktree_branch_and_detached_binding(self):
        task = self.task()
        with self.assertRaises(Error):
            self.c.bind_worktree(task["id"], self.root)
        self.git("switch", "--detach", cwd=task["worktree"])
        rebound = self.c.bind_worktree(task["id"], task["worktree"])
        self.assertEqual(self.git("branch", "--show-current", cwd=rebound["worktree"]), task["branch"])
        self.git("switch", "-c", "foreign", cwd=task["worktree"])
        with self.assertRaisesRegex(Error, "wrong branch"):
            self.c.claim(task["id"])

    def test_failure_persistence_and_exact_sha_validation(self):
        task = self.task(sample=False)
        self.approved(task)
        self.c.begin(task["id"])
        self.c.config["checks"] = [[sys.executable, "-c", "raise SystemExit(7)"]]
        result = self.c.validate(task["id"])
        self.assertEqual(result["validation"]["status"], "TESTS FAILED")
        self.assertEqual(result["validation"]["checks"][0]["exit_code"], 7)
        self.assertTrue(Path(result["validation"]["checks"][0]["log"]).exists())
        self.assertEqual(Coordinator(self.root).get(task["id"])["validation"]["status"], "TESTS FAILED")
        with self.assertRaises(Error):
            self.c.ready(task["id"])
        self.c.config["checks"] = [[sys.executable, "-c", "print('pass')"]]
        self.c.validate(task["id"])
        self.git("commit", "--allow-empty", "-m", "test: change head after validation", cwd=task["worktree"])
        with self.assertRaisesRegex(Error, "exact current commit"):
            self.c.ready(task["id"])

    def test_missing_executable_is_not_pass(self):
        task = self.task(sample=False)
        self.approved(task)
        self.c.begin(task["id"])
        self.c.config["checks"] = [["/nonexistent/arcigy-test"]]
        result = self.c.validate(task["id"])
        self.assertEqual(result["validation"]["checks"][0]["status"], "TESTS NOT AVAILABLE")
        self.assertEqual(result["validation"]["status"], "TESTS FAILED")

    def test_populated_environment_and_shared_storage_block_checks(self):
        task = self.task(sample=False)
        self.approved(task)
        self.c.begin(task["id"])
        path = Path(task["worktree"])
        (path / ".env").write_text("DATABASE_URL=fixture-no-secret\n")
        self.git("add", ".env", cwd=path)
        self.git("commit", "-m", "test: unsafe environment fixture", cwd=path)
        with self.assertRaisesRegex(Error, "Populated environment"):
            self.c.validate(task["id"])
        (path / ".env").unlink()
        (path / "storage").symlink_to(self.root, target_is_directory=True)
        with self.assertRaisesRegex(Error, "symlink"):
            self.c.environment_guard(path)

    def test_resource_and_dependency_guards(self):
        one = self.task("one", resources=["schema:catalog"])
        two = self.task("two", resources=["schema:catalog"])
        dependent = self.task("dependent", dependencies=[one["id"]])
        for task in (one, two, dependent):
            self.approved(task)
        self.c.begin(one["id"])
        with self.assertRaisesRegex(Error, "Resource conflicts"):
            self.c.begin(two["id"])
        with self.assertRaisesRegex(Error, "Dependency is not integrated"):
            self.c.begin(dependent["id"])

    def test_session_evidence_and_restore(self):
        task = self.task()
        with self.assertRaises(Error):
            self.c.bind_session(task["id"], "actual-id", "local", "native", "wrong evidence")
        bound = self.c.bind_session(task["id"], "actual-id", "local", "native", '{"threadId":"actual-id"}')
        self.assertEqual(bound["session"]["live_status"], "UNVERIFIED")
        self.assertEqual(Coordinator(self.root).get(task["id"])["session"]["thread_id"], "actual-id")
        self.assertIn("UNVERIFIED", self.c.reconcile()["tasks"][0]["session_live_status"])

    def test_two_task_integration_and_idempotent_resume(self):
        base = self.git("rev-parse", "develop")
        one, two = self.completed("one"), self.completed("two")
        record = self.c.start_integration([one["id"], two["id"]])
        result = self.c.run_integration(record["id"])
        self.assertEqual(result["status"], "READY_FOR_PR")
        self.assertEqual(self.git("rev-parse", "develop"), base)
        for task in (one, two):
            for name, expected in task["sample_manifest"].items():
                self.assertEqual((Path(result["worktree"]) / name).read_text(), expected)
        resumed = Coordinator(self.root).run_integration(record["id"])
        self.assertEqual(resumed["final_sha"], result["final_sha"])
        finalized = self.c.finalize(record["id"], result["branch"])
        self.assertEqual(finalized["status"], "INTEGRATED")
        self.assertEqual(self.c.get(one["id"])["status"], "INTEGRATED")
        self.assertEqual(self.c.run_integration(record["id"])["final_sha"], result["final_sha"])

    def test_recover_merge_done_before_journal_commit(self):
        task = self.completed("one")
        record = self.c.start_integration([task["id"]])
        path = Path(record["worktree"])
        self.git("worktree", "add", "-b", record["branch"], str(path), "develop")
        self.git("merge", "--no-ff", "--no-edit", task["final_sha"], cwd=path)
        recovered_head = self.git("rev-parse", "HEAD", cwd=path)
        result = Coordinator(self.root).run_integration(record["id"])
        self.assertEqual(result["final_sha"], recovered_head)
        self.assertTrue(result["sources"][0]["validation"]["checks"])

    def test_conflict_keeps_work_and_recovers_after_manual_resolution(self):
        self.c.config["checks"] = [[sys.executable, "-c", "print('isolated integration fixture')"]]
        tasks = []
        for name in ("one", "two"):
            task = self.task(name, sample=False)
            self.approved(task)
            self.c.begin(task["id"])
            path = Path(task["worktree"])
            (path / "README.md").write_text(name)
            self.git("add", "README.md", cwd=path)
            self.git("commit", "-m", "test: conflict " + name, cwd=path)
            self.c.validate(task["id"])
            tasks.append(self.c.ready(task["id"]))
        record = self.c.start_integration([t["id"] for t in tasks])
        record = self.c.prepare_worktree(record["id"])
        self.bind_environment(record)
        with self.assertRaises(Error):
            self.c.run_integration(record["id"])
        failed = Coordinator(self.root).get(record["id"], table="integrations")
        self.assertEqual(failed["status"], "BLOCKED")
        path = Path(failed["worktree"])
        self.assertIn("<<<<<<<", (path / "README.md").read_text())
        with self.assertRaises(Error):
            self.c.run_integration(record["id"])
        (path / "README.md").write_text("one and two\n")
        self.git("add", "README.md", cwd=path)
        self.git("commit", "-m", "test: preserve both sample contributions", cwd=path)
        self.assertEqual(self.c.run_integration(record["id"])["status"], "READY_FOR_PR")

    def test_sample_scope_content_and_auto_integration_exclusion(self):
        task = self.completed("safe")
        with self.assertRaisesRegex(Error, "Select unique ready tasks"):
            self.c.start_integration([])
        path = Path(task["worktree"])
        (path / "README.md").write_text("Disallowed business edit")
        self.git("add", "README.md", cwd=path)
        self.git("commit", "-m", "test: unsafe sample edit", cwd=path)
        self.c.begin(task["id"])
        with self.assertRaisesRegex(Error, "declared fixture files"):
            self.c.validate(task["id"])

    def test_pause_retains_capacity_until_observed_stop(self):
        self.c.config["max_concurrency"] = 1
        one, two = self.task("one"), self.task("two")
        self.c.claim(one["id"])
        paused = self.c.transition(one["id"], "PAUSED", "User pause")
        self.assertTrue(paused["stop_pending"])
        self.assertEqual(self.c.claim(two["id"])["status"], "QUEUED")
        with self.assertRaisesRegex(Error, "acknowledge stopping"):
            self.c.claim(one["id"])
        self.c.acknowledge_stop(one["id"], json.dumps({"task_id": one["id"], "stopped": True, "evidence": "Test observes no running worker"}))
        self.assertEqual(self.c.claim(two["id"])["status"], "PLANNING")

    def test_unverified_environment_and_shared_ui_ports_rejected(self):
        task = self.c.register("Unsafe", "Unsafe", "unsafe")
        task = self.c.prepare_worktree(task["id"])
        self.approved(task)
        self.c.begin(task["id"])
        with self.assertRaisesRegex(Error, "TESTS NOT RUN"):
            self.c.validate(task["id"])
        with self.assertRaisesRegex(Error, "non-shared ports"):
            self.c.bind_environment(task["id"], {"worktree": task["worktree"], "KITCHEN_UI_BASE_URL": "http://127.0.0.1:5180", "PRICING_UI_BASE_URL": "http://127.0.0.1:5180", "evidence": "Invalid shared service"})

    def test_replan_invalidates_approval_and_implementation_resumes(self):
        task = self.task()
        self.approved(task)
        replanning = self.c.claim(task["id"])
        self.assertEqual(replanning["status"], "PLANNING")
        self.assertIsNone(replanning["approval"])
        self.c.save_plan(task["id"], "Revised sample plan")
        self.c.approve(task["id"], "Approve revised test plan")
        self.c.begin(task["id"])
        self.c.transition(task["id"], "PAUSED", "Pause implementation")
        with self.assertRaisesRegex(Error, "acknowledge stopping"):
            self.c.begin(task["id"])
        self.c.acknowledge_stop(task["id"], json.dumps({"task_id": task["id"], "stopped": True, "evidence": "Test has no running worker"}))
        self.assertEqual(self.c.begin(task["id"])["status"], "IMPLEMENTING")

    def test_native_integration_binding_before_execution(self):
        task = self.completed()
        record = self.c.start_integration([task["id"]])
        self.c.provision(record["id"])
        path = self.root / ".codex-orchestrator/native-integration"
        self.git("worktree", "add", "--detach", str(path), record["branch"])
        self.c.bind_worktree(record["id"], path)
        self.c.bind_session(record["id"], "native-integration", "local", "native", '{"threadId":"native-integration"}')
        result = self.c.run_integration(record["id"])
        self.assertEqual(result["worktree"], str(path.resolve()))
        self.assertEqual(result["session"]["thread_id"], "native-integration")

    def test_resource_updates_detect_cycles_and_invalidate_approval(self):
        one, two = self.task("one"), self.task("two")
        self.approved(one)
        updated = self.c.set_resources(one["id"], ["src/catalog"], [two["id"]])
        self.assertEqual(updated["status"], "AWAITING_APPROVAL")
        with self.assertRaisesRegex(Error, "Dependency cycle"):
            self.c.set_resources(two["id"], [], [one["id"]])

    def test_timeout_terminates_descendant_processes(self):
        task = self.task(sample=False)
        self.approved(task)
        self.c.begin(task["id"])
        pid_file = self.c.state / "timeout-child.pid"
        code = "import os,time; from pathlib import Path; pid=os.fork(); "
        code += "Path(" + repr(str(pid_file)) + ").write_text(str(pid)) if pid else None; time.sleep(30)"
        self.c.config["checks"] = [[sys.executable, "-c", code]]
        self.c.config["check_timeout_seconds"] = 0.5
        result = self.c.validate(task["id"])
        self.assertEqual(result["validation"]["status"], "TESTS FAILED")
        pid = pid_file.read_text()
        status = subprocess.run(["ps", "-o", "stat=", "-p", pid], text=True, capture_output=True).stdout.strip()
        self.assertTrue(not status or status.startswith("Z"), status)

    def test_registration_survives_missing_base(self):
        task = self.c.register("Missing base", "Do not lose this", "missing", base="no-such-ref")
        with self.assertRaises(Error):
            self.c.provision(task["id"])
        restored = Coordinator(self.root).get(task["id"])
        self.assertEqual(restored["original_request"], "Do not lose this")
        self.assertEqual(self.c.register("Next", "Next", "next")["id"], "ARC-002")


if __name__ == "__main__":
    unittest.main(verbosity=2)
