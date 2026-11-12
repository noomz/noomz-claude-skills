import contextlib
import io
import os
import subprocess
import tarfile
import tempfile
import time
import unittest
from pathlib import Path

import dream


def note(name, desc="a fact", body="body", extra=""):
    return f"---\nname: {name}\ndescription: {desc}\nmetadata:\n  type: project\n{extra}---\n\n{body}\n"


class Fixture(unittest.TestCase):
    def setUp(self):
        self.td = tempfile.TemporaryDirectory()
        self.addCleanup(self.td.cleanup)
        self.root = Path(self.td.name)
        self.mem = self.root / "proj" / "memory"
        self.mem.mkdir(parents=True)

    def put(self, rel, text, base=None):
        p = (base or self.mem) / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text, encoding="utf-8")
        return p

    def run_cli(self, *args):
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(buf):
            code = dream.main(list(args))
        return code, buf.getvalue()

    def tree(self, base):
        return {str(p.relative_to(base)): p.read_bytes() for p in Path(base).rglob("*") if p.is_file()}


class IndexLint(Fixture):
    def test_over_limit_index_marks_cut(self):
        lines = []
        for i in range(210):
            self.put(f"n{i}.md", note(f"n{i}"))
            lines.append(f"- [n{i}](n{i}.md) — hook")
        self.put("MEMORY.md", "\n".join(lines) + "\n")
        r, _, _ = dream.lint(str(self.mem))
        self.assertEqual(r["lines"], 210)
        self.assertEqual(len(r["cut"]), 10)

    def test_unlisted_note_is_orphan(self):
        self.put("a.md", note("a"))
        self.put("b.md", note("b"))
        self.put("MEMORY.md", "- [a](a.md) — x\n")
        r, _, _ = dream.lint(str(self.mem))
        self.assertEqual(r["orphans"], ["b.md"])

    def test_two_level_index_is_deep_not_orphan(self):
        names = [f"t{i}" for i in range(12)]
        for n in names:
            self.put(f"{n}.md", note(n))
        self.put("topic.md", note("topic", body="\n".join(f"- [[{n}]]" for n in names)))
        self.put("MEMORY.md", "- [topic](topic.md) — all\n")
        r, _, _ = dream.lint(str(self.mem))
        self.assertEqual(len(r["deep"]), 12)
        self.assertEqual(r["orphans"], [])

    def test_small_topic_page_is_an_index_page_by_name_only(self):
        for n in ("a", "b", "c", "d"):
            self.put(f"{n}.md", note(n))
        self.put("topic_x.md", note("topic x", body="- [[a]]\n- [[b]]"))
        self.put("plain.md", note("plain", body="see [[c]] and [[d]]"))
        self.put("MEMORY.md", "- [x](topic_x.md) — x\n- [plain](plain.md) — p\n")
        r, _, _ = dream.lint(str(self.mem))
        self.assertEqual(r["deep"], ["a.md", "b.md"])
        self.assertEqual(r["orphans"], ["c.md", "d.md"])

    def test_missing_index_target(self):
        self.put("MEMORY.md", "- [gone](gone.md) — x\n")
        r, _, _ = dream.lint(str(self.mem))
        self.assertEqual(r["missing"], ["gone.md"])

    def test_long_line_counted(self):
        self.put("a.md", note("a"))
        self.put("MEMORY.md", "- [a](a.md) — " + "x" * 200 + "\n")
        r, _, _ = dream.lint(str(self.mem))
        self.assertEqual(len(r["long"]), 1)

    def test_archive_ignored(self):
        self.put("a.md", note("a"))
        self.put("archive/old.md", note("old", body="[[nothing-here]]"))
        self.put("MEMORY.md", "- [a](a.md) — x\n")
        r, notes, _ = dream.lint(str(self.mem))
        self.assertEqual(list(notes), ["a.md"])
        self.assertEqual(r["dead"], [])

    def test_propose_keeps_curated_line_and_shortens_long_one(self):
        self.put("a.md", note("a", desc="d" * 400))
        self.put("b.md", note("b"))
        self.put("c.md", note("c", desc="from description"))
        self.put("MEMORY.md", "- [a](a.md) — " + "y" * 300 + "\n- [b](b.md) — my curated hook\n")
        _, notes, index = dream.lint(str(self.mem))
        text, need = dream.propose(notes, index)
        lines = text.splitlines()
        self.assertLessEqual(len(lines[0]), dream.LINE_BUDGET)
        self.assertEqual(lines[1], "- [b](b.md) — my curated hook")
        self.assertIn("from description", lines[2])
        self.assertEqual(need, [])


class Links(Fixture):
    def setUp(self):
        super().setUp()
        self.put("foo_bar.md", note("foo-bar"))
        self.put("dup-a.md", note("dup-x"))
        self.put("dup_a.md", note("dup-y"))
        self.src = self.put("src.md", note("src", body="[[foo_bar]] [[Foo-Bar|alias]] [[nope]] [[Dup_A]]"))

    def test_plan_splits_fixable_and_unresolved(self):
        r, _, _ = dream.lint(str(self.mem))
        self.assertEqual({t for _, t in r["fixable"]}, {"Foo-Bar"})
        self.assertEqual({t for _, t in r["dead"]}, {"nope", "Dup_A"})

    def test_ambiguous_is_not_rewritten(self):
        _, notes, _ = dream.lint(str(self.mem))
        why = {t: w for _, t, w in dream.link_plan(notes)["unresolved"]}
        self.assertTrue(why["Dup_A"].startswith("ambiguous"))

    def test_dry_run_changes_nothing(self):
        before = self.tree(self.root)
        code, out = self.run_cli("fix-links", "--memory", str(self.mem))
        self.assertEqual(code, 0)
        self.assertIn("src.md: [[Foo-Bar]] -> [[foo_bar]]", out)
        self.assertIn("dry run", out)
        self.assertEqual(self.tree(self.root), before)

    def test_apply_rewrites_snapshots_and_keeps_alias(self):
        code, out = self.run_cli("fix-links", "--memory", str(self.mem), "--apply")
        self.assertEqual(code, 0)
        text = self.src.read_text()
        self.assertIn("[[foo_bar|alias]]", text)
        self.assertIn("[[nope]]", text)
        backups = list((self.root / "proj" / "memory-backups").glob("memory-*.tar.gz"))
        self.assertEqual(len(backups), 1)
        self.assertIn(str(backups[0]), out)


class LinkTargets(Fixture):
    def test_rewrite_targets_file_stem_not_title(self):
        self.put("unicef-staging-deploy.md", note("UNICEF staging deploy"))
        src = self.put("src.md", note("src", body="[[unicef_staging_deploy]] [[UNICEF staging deploy]] [[unicef-staging-deploy]]"))
        _, notes, _ = dream.lint(str(self.mem))
        plan = dream.link_plan(notes)
        self.assertEqual(plan["fix"], [("src.md", "unicef_staging_deploy", "unicef-staging-deploy")])
        code, out = self.run_cli("fix-links", "--memory", str(self.mem), "--apply")
        self.assertEqual(code, 0)
        self.assertEqual(src.read_text().count("[[unicef-staging-deploy]]"), 2)
        self.assertIn("[[UNICEF staging deploy]]", src.read_text())

    def test_archive_link_resolves_when_archived_note_exists(self):
        self.put("archive/old.md", note("old"))
        self.put("archive/sub/deep.md", note("deep"))
        self.put("src.md", note("src", body="[[archive/old]] [[archive/old.md]] [[archive/sub/deep]] [[archive/gone]]"))
        r, notes, _ = dream.lint(str(self.mem))
        self.assertEqual(list(notes), ["src.md"])
        self.assertEqual(r["dead"], [("src.md", "archive/gone")])
        self.assertEqual(r["fixable"], [])
        self.assertEqual(r["notes"], 1)
        self.assertEqual(r["orphans"], ["src.md"])

    def test_fix_links_leaves_archive_links_alone(self):
        self.put("archive/old.md", note("old"))
        self.put("old.md", note("Old Title"))
        src = self.put("src.md", note("src", body="[[archive/old]] [[Archive/Old]] [[old]]"))
        before = src.read_text()
        _, notes, _ = dream.lint(str(self.mem))
        plan = dream.link_plan(notes, dream.archived_stems(str(self.mem)))
        self.assertEqual(plan["fix"], [])
        self.assertEqual([t for _, t, _ in plan["unresolved"]], ["Archive/Old"])
        self.run_cli("fix-links", "--memory", str(self.mem), "--apply")
        self.assertEqual(src.read_text(), before)

    def test_plain_link_is_never_pointed_into_archive(self):
        self.put("archive/old.md", note("old"))
        self.put("src.md", note("src", body="[[old]]"))
        r, _, _ = dream.lint(str(self.mem))
        self.assertEqual(r["dead"], [("src.md", "old")])
        self.assertEqual(r["fixable"], [])


class Apply(Fixture):
    def test_apply_index_dry_run_then_write_with_snapshot(self):
        self.put("a.md", note("a"))
        self.put("b.md", note("b"))
        self.put("MEMORY.md", "- [a](a.md) — x\n")
        before = self.tree(self.root)
        code, out = self.run_cli("apply", "--memory", str(self.mem))
        self.assertIn("dry run", out)
        self.assertEqual(self.tree(self.root), before)
        code, out = self.run_cli("apply", "--memory", str(self.mem), "--apply")
        self.assertIn("b.md", (self.mem / "MEMORY.md").read_text())
        self.assertTrue(list((self.root / "proj" / "memory-backups").glob("*.tar.gz")))
        self.assertFalse((self.mem / "memory-backups").exists())

    def test_git_repo_with_uncommitted_file_refuses_unless_forced(self):
        self.put("a.md", note("a"))
        self.put("MEMORY.md", "- [a](a.md) — x\n")
        git = lambda *a: subprocess.run(["git", "-C", str(self.mem), *a], check=True, capture_output=True)
        git("init", "-q")
        git("add", ".")
        git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init")
        self.put("b.md", note("b"))
        (self.mem / "MEMORY.md").write_text("- [a](a.md) — edited\n")
        code, out = self.run_cli("apply", "--memory", str(self.mem), "--apply")
        self.assertEqual(code, 1)
        self.assertIn("Commit first", out)
        self.assertEqual((self.mem / "MEMORY.md").read_text(), "- [a](a.md) — edited\n")
        code, out = self.run_cli("apply", "--memory", str(self.mem), "--apply", "--force")
        self.assertEqual(code, 0)
        self.assertIn("b.md", (self.mem / "MEMORY.md").read_text())
        self.assertTrue(list((self.root / "proj" / "memory-backups").glob("*.tar.gz")))

    def test_git_repo_clean_still_gets_a_snapshot(self):
        self.put("a.md", note("a"))
        self.put("MEMORY.md", "- [a](a.md) — x\n")
        git = lambda *a: subprocess.run(["git", "-C", str(self.mem), *a], check=True, capture_output=True)
        git("init", "-q")
        git("add", ".")
        git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init")
        self.put("b.md", note("b"))
        git("add", "b.md")
        git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "b")
        code, out = self.run_cli("apply", "--memory", str(self.mem), "--apply")
        self.assertEqual(code, 0)
        self.assertIn("snapshot:", out)
        self.assertEqual(len(list((self.root / "proj" / "memory-backups").glob("*.tar.gz"))), 1)


class Secrets(Fixture):
    def test_reports_kind_never_value(self):
        self.put("a.md", note("a", body="db: postgres://admin:hunter2pass@host/db\npassword: s3cretValue!"))
        self.put("MEMORY.md", "- [a](a.md) — x\n")
        code, out = self.run_cli("lint", "--memory", str(self.mem))
        self.assertIn("a.md: URL or DSN with credentials, password assignment", out)
        self.assertNotIn("hunter2pass", out)
        self.assertNotIn("s3cretValue", out)


class RuleFixture(Fixture):
    def setUp(self):
        super().setUp()
        self.ws = self.root / "ws"
        self.ws.mkdir()

    def config(self, toml):
        self.put(".claude/dream.toml", toml, base=self.ws)

    def check(self):
        return self.run_cli("rules", str(self.ws))


class Rules(RuleFixture):
    def test_file_cap(self):
        self.put("STATUS.md", "x\n" * 61, base=self.ws)
        self.config('[[file_cap]]\npath = "STATUS.md"\nmax_lines = 60\n')
        code, out = self.check()
        self.assertEqual(code, 1)
        self.assertIn("61 lines > 60", out)

    def test_file_cap_bytes_ok(self):
        self.put("STATUS.md", "x\n" * 5, base=self.ws)
        self.config('[[file_cap]]\npath = "STATUS.md"\nmax_lines = 60\nmax_bytes = 100\n')
        self.assertEqual(self.check()[0], 0)

    def test_row_cap_counts_table_rows_and_list_items(self):
        rows = "| a | b |\n|---|---|\n| " + "x" * 400 + " |\n- short\n- " + "y" * 350 + "\n"
        self.put("ledger.md", "# t\n\nprose line that is long " + "z" * 500 + "\n" + rows, base=self.ws)
        self.config('[[row_cap]]\npath = "ledger.md"\nmax_bytes = 300\n')
        code, out = self.check()
        self.assertEqual(code, 1)
        self.assertIn("2 of 4 rows over 300 B", out)
        self.assertIn("max 4", out.replace("max 40", "max 4"))

    def test_index_count(self):
        for n in ("a", "b", "c"):
            self.put(f"wiki/{n}.md", note(n), base=self.ws)
        self.put("wiki/index.md", "[a](a.md) [[b]] [gone](gone.md)\n", base=self.ws)
        self.config('[[index_count]]\nindex = "wiki/index.md"\nfolder = "wiki"\n')
        code, out = self.check()
        self.assertEqual(code, 1)
        self.assertIn("links 2 of 3 pages", out)
        self.assertIn("unlinked: wiki/c.md", out)
        self.assertIn("gone.md", out)

    def test_required_field(self):
        self.put("handoffs/a.md", "---\nstatus: open\n---\n", base=self.ws)
        self.put("handoffs/b.md", "no frontmatter\n", base=self.ws)
        self.config('[[required_field]]\npath = "handoffs/*.md"\nfield = "status"\n')
        code, out = self.check()
        self.assertEqual(code, 1)
        self.assertIn("1 of 2 files have status", out)
        self.assertIn("handoffs/b.md", out)

    def test_superseded_frontmatter_and_text(self):
        self.put("h/new.md", "---\nstatus: done\n---\n", base=self.ws)
        self.put("h/a.md", "---\nsuperseded_by: new.md\n---\n", base=self.ws)
        self.put("h/b.md", "SUPERSEDED by `h/moved.md`\n", base=self.ws)
        self.put("h/c.md", "SUPERSEDED by `h/new.md`\n", base=self.ws)
        self.config('[[superseded]]\npath = "h/*.md"\n')
        code, out = self.check()
        self.assertEqual(code, 1)
        self.assertIn("3 superseded pointers, 1 broken", out)
        self.assertIn("h/b.md -> h/moved.md", out)

    def test_stale_label_uses_date_then_mtime(self):
        self.put("h/old.md", "---\nstatus: active\ndate: 2020-01-01\n---\n", base=self.ws)
        self.put("h/fresh.md", "---\nstatus: active\ndate: " + time.strftime("%Y-%m-%d") + "\n---\n", base=self.ws)
        mt = self.put("h/mtime.md", "---\nstatus: open\n---\n", base=self.ws)
        os.utime(mt, (1_500_000_000, 1_500_000_000))
        self.put("h/done.md", "---\nstatus: done\ndate: 2020-01-01\n---\n", base=self.ws)
        self.config('[[stale_label]]\npath = "h/*.md"\nstatuses = ["active", "open"]\nmax_age_days = 30\n')
        code, out = self.check()
        self.assertEqual(code, 1)
        self.assertIn("3 files labelled", out)
        self.assertIn("2 older than 30 d", out)
        self.assertIn("h/old.md", out)
        self.assertIn("h/mtime.md", out)
        self.assertNotIn("h/fresh.md (", out)

    def test_unknown_option_rejected(self):
        self.config('[[file_cap]]\npath = "x"\nmax_lines = 1\nbogus = 2\n')
        code, out = self.check()
        self.assertEqual(code, 2)
        self.assertIn("unknown option bogus", out)

    def test_goal_printed_and_no_config(self):
        self.config('goal = "keep it short"\n')
        code, out = self.check()
        self.assertEqual(code, 0)
        self.assertIn("goal: keep it short", out)
        code, out = self.run_cli("rules", str(self.root / "proj"))
        self.assertEqual(code, 2)


class Retire(Fixture):
    def setUp(self):
        super().setUp()
        self.put("keep.md", note("keep"))
        self.put("old.md", note("old", body="PR #12 merged"))
        self.put("sub/deep.md", note("deep"))
        self.put("MEMORY.md", "- [keep](keep.md) — k\n- [old](old.md) — o\n- [deep](sub/deep.md) — d\n")

    def test_dry_run_changes_nothing(self):
        before = self.tree(self.root)
        code, out = self.run_cli("retire", "--memory", str(self.mem), "--note", "old")
        self.assertEqual(code, 0)
        self.assertIn("old.md -> archive/old.md", out)
        self.assertIn("dry run", out)
        self.assertEqual(self.tree(self.root), before)

    def test_apply_moves_never_deletes_and_snapshots(self):
        code, out = self.run_cli("retire", "--memory", str(self.mem), "--note", "old", "--note", "sub/deep.md", "--apply")
        self.assertEqual(code, 0)
        self.assertTrue((self.mem / "archive" / "old.md").is_file())
        self.assertTrue((self.mem / "archive" / "sub" / "deep.md").is_file())
        self.assertFalse((self.mem / "old.md").exists())
        self.assertEqual((self.mem / "MEMORY.md").read_text(), "- [keep](keep.md) — k\n")
        self.assertEqual(len(list((self.root / "proj" / "memory-backups").glob("*.tar.gz"))), 1)
        r, notes, _ = dream.lint(str(self.mem))
        self.assertEqual(list(notes), ["keep.md"])
        self.assertEqual(r["missing"], [])

    def test_name_collision_gets_suffix(self):
        self.put("archive/old.md", "earlier")
        self.run_cli("retire", "--memory", str(self.mem), "--note", "old", "--apply")
        self.assertEqual((self.mem / "archive" / "old.md").read_text(), "earlier")
        self.assertTrue((self.mem / "archive" / "old-2.md").is_file())

    def test_unknown_note_and_two_projects_refused(self):
        code, out = self.run_cli("retire", "--memory", str(self.mem), "--note", "nope", "--apply")
        self.assertEqual(code, 2)
        self.assertTrue((self.mem / "old.md").exists())
        self.put("a.md", note("a"), base=self.root / "other" / "memory")
        code, out = self.run_cli("retire", "--root", str(self.root), "--note", "old")
        self.assertEqual(code, 2)
        self.assertIn("exactly one project", out)


class RetireRefusals(Fixture):
    def test_non_md_file_is_refused_with_a_plain_message(self):
        self.put("a.md", note("a"))
        self.put("MEMORY.md.migrated-from-work", "old index\n")
        before = self.tree(self.root)
        code, out = self.run_cli("retire", "--memory", str(self.mem), "--note", "MEMORY.md.migrated-from-work", "--apply")
        self.assertNotEqual(code, 0)
        self.assertIn("only .md notes can be retired", out)
        self.assertIn("MEMORY.md.migrated-from-work", out)
        self.assertEqual(self.tree(self.root), before)


class Safety(Fixture):
    def test_propose_never_copies_a_secret_into_the_index(self):
        self.put("a.md", note("a", desc="login postgres://admin:hunter2pass@host/db"))
        self.put("MEMORY.md", "")
        _, notes, index = dream.lint(str(self.mem))
        text, need = dream.propose(notes, index)
        self.assertNotIn("hunter2pass", text)
        self.assertEqual(need, ["a.md"])

    def test_secret_scan_covers_the_index_too(self):
        self.put("MEMORY.md", "- token: ghp_" + "a" * 36 + "\n")
        code, out = self.run_cli("lint", "--memory", str(self.mem))
        self.assertIn("MEMORY.md", out)
        self.assertIn("API token", out)
        self.assertNotIn("ghp_a", out)

    def test_long_index_line_with_a_secret_is_not_echoed(self):
        self.put("a.md", note("a"))
        self.put("MEMORY.md", "- [a](a.md) — " + "x" * 120 + " ghp_" + "b" * 36 + " " + "y" * 50 + "\n")
        code, out = self.run_cli("lint", "--memory", str(self.mem))
        self.assertIn("long line", out)
        self.assertIn("secret-like, not shown", out)
        self.assertNotIn("ghp_b", out)

    def test_workspace_memory_path_is_relative_to_workspace(self):
        ws = self.root / "ws"
        self.put(".claude/dream.toml", 'memory = "mem"\n', base=ws)
        self.put("a.md", note("a"), base=ws / "mem")
        rows, _ = dream.targets(dream.build_parser().parse_args(["lint", "--workspace", str(ws)]))
        self.assertEqual(rows[0][1], os.path.realpath(ws / "mem"))


class ConfigShape(RuleFixture):
    def test_wrong_types_rejected_not_crashed(self):
        self.config('[[file_cap]]\npath = "x"\nmax_lines = "60"\n')
        code, out = self.check()
        self.assertEqual(code, 2)
        self.assertIn("max_lines must be a non-negative integer", out)

    def test_single_table_instead_of_array_rejected(self):
        self.config('[file_cap]\npath = "x"\nmax_lines = 1\n')
        code, out = self.check()
        self.assertEqual(code, 2)
        self.assertIn("written [[file_cap]]", out)

    def test_stale_label_custom_date_field(self):
        self.put("h/a.md", "---\nstatus: open\nupdated: 2020-01-01\ndate: " + time.strftime("%Y-%m-%d") + "\n---\n", base=self.ws)
        self.config('[[stale_label]]\npath = "h/*.md"\nstatuses = ["open"]\nmax_age_days = 30\ndate_field = "updated"\n')
        code, out = self.check()
        self.assertEqual(code, 1)
        self.assertIn("1 older than 30 d", out)


EXAMPLES = Path(__file__).resolve().parent.parent / "examples"


class Examples(Fixture):
    def build(self, name):
        ws = self.root / name
        ws.mkdir()
        (ws / ".claude").mkdir()
        (ws / ".claude" / "dream.toml").write_text((EXAMPLES / name / "dream.toml").read_text())
        return ws

    def test_workspace_example_parses_and_every_check_runs(self):
        ws = self.build("workspace")
        self.put("STATUS.md", "x\n" * 61, base=ws)
        self.put("docs/decisions.md", "| id | decision |\n|---|---|\n| 1 | " + "d" * 400 + " |\n", base=ws)
        self.put("wiki/index.md", "[[a]]\n", base=ws)
        self.put("wiki/a.md", note("a"), base=ws)
        self.put("wiki/b.md", note("b"), base=ws)
        self.put("handoffs/h1.md", "---\nstatus: open\ndate: 2020-01-01\n---\nSUPERSEDED by `handoffs/gone.md`\n", base=ws)
        self.put("handoffs/h2.md", "no frontmatter\n", base=ws)
        code, out = self.run_cli("rules", str(ws))
        self.assertEqual(code, 1)
        for kind in dream.CHECKS:
            self.assertIn(kind, out)
        self.assertIn("61 lines > 60", out)
        self.assertIn("1 of 2 rows over 300 B", out)
        self.assertIn("unlinked: wiki/b.md", out)
        self.assertIn("1 of 2 files have status", out)
        self.assertIn("1 broken", out)
        self.assertIn("1 older than", out)
        self.assertNotIn("goal: \n", out)

    def test_workspace_example_passes_on_a_clean_tree(self):
        ws = self.build("workspace")
        self.put("STATUS.md", "x\n" * 10, base=ws)
        self.put("docs/decisions.md", "| id | decision |\n|---|---|\n| 1 | ok |\n", base=ws)
        self.put("wiki/index.md", "[[a]]\n", base=ws)
        self.put("wiki/a.md", note("a"), base=ws)
        self.put("handoffs/h1.md", "---\nstatus: done\n---\n", base=ws)
        code, out = self.run_cli("rules", str(ws))
        self.assertEqual(code, 0, out)

    def test_single_repo_example_has_only_a_goal(self):
        ws = self.build("single-repo")
        code, out = self.run_cli("rules", str(ws))
        self.assertEqual(code, 0)
        self.assertIn("goal:", out)
        self.assertIn("0 failing check(s)", out)


class Root(Fixture):
    def test_flag_and_env_override(self):
        self.assertEqual(dream.memory_root(str(self.root)), os.path.realpath(self.root))
        os.environ["DREAM_MEMORY_ROOT"] = str(self.root)
        self.addCleanup(os.environ.pop, "DREAM_MEMORY_ROOT")
        self.assertEqual(dream.memory_root(None), os.path.realpath(self.root))
        with self.assertRaises(dream.Die):
            dream.memory_root(str(self.root / "missing"))

    def test_symlinked_memory_folder_is_listed_once(self):
        self.put("a.md", note("a"))
        (self.root / "other").mkdir()
        os.symlink(self.mem, self.root / "other" / "memory")
        rows, _ = dream.targets(dream.build_parser().parse_args(["lint", "--root", str(self.root)]))
        self.assertEqual(len(rows), 1)

    def test_write_through_symlinked_memory_snapshots_the_notes(self):
        self.put("a.md", note("a"))
        self.put("b.md", note("b"))
        self.put("MEMORY.md", "- [a](a.md) — x\n")
        (self.root / "other").mkdir()
        os.symlink(self.mem, self.root / "other" / "memory")
        code, out = self.run_cli("apply", "--root", str(self.root), "other", "--apply")
        self.assertEqual(code, 0, out)
        backups = list((self.root / "proj" / "memory-backups").glob("*.tar.gz"))
        self.assertEqual(len(backups), 1)
        self.assertFalse((self.root / "other" / "memory-backups").exists())
        with tarfile.open(backups[0]) as tar:
            names = tar.getnames()
        self.assertIn("memory/a.md", names)
        self.assertIn("memory/b.md", names)

    def test_filter_selects_project(self):
        self.put("a.md", note("a"))
        code, out = self.run_cli("lint", "--root", str(self.root), "pro")
        self.assertIn("== proj", out)

class BytesSurvive(Fixture):
    def setUp(self):
        super().setUp()
        self.put("foo-bar.md", note("foo-bar"))

    def raw(self, rel, data):
        p = self.mem / rel
        p.write_bytes(data)
        return p

    def test_crlf_note_keeps_its_line_endings(self):
        data = note("src", body="caf\u00e9 [[foo_bar]]\nline2").replace("\n", "\r\n").encode()
        p = self.raw("src.md", data)
        code, out = self.run_cli("fix-links", "--memory", str(self.mem), "--apply")
        self.assertEqual(code, 0, out)
        self.assertEqual(p.read_bytes(), data.replace(b"[[foo_bar]]", b"[[foo-bar]]"))

    def test_non_utf8_note_is_skipped_by_name_and_never_rewritten(self):
        data = b"---\nname: bad\ndescription: d\n---\n\ncaf\xe9 [[foo_bar]]\n"
        p = self.raw("bad.md", data)
        other = self.put("ok.md", note("ok", body="[[foo_bar]]"))
        code, out = self.run_cli("fix-links", "--memory", str(self.mem), "--apply")
        self.assertEqual(code, 1)
        self.assertIn("bad.md", out)
        self.assertEqual(p.read_bytes(), data)
        self.assertIn("[[foo-bar]]", other.read_text())

    def test_apply_keeps_crlf_index_and_appends_crlf_lines(self):
        self.put("b.md", note("b"))
        data = b"- [foo-bar](foo-bar.md) \xe2\x80\x94 x\r\n"
        p = self.raw("MEMORY.md", data)
        code, out = self.run_cli("apply", "--memory", str(self.mem), "--apply")
        self.assertEqual(code, 0, out)
        got = p.read_bytes()
        self.assertTrue(got.startswith(data))
        self.assertTrue(got.endswith(b"\r\n"))
        self.assertNotIn(b"\n", got.replace(b"\r\n", b""))

    def test_non_utf8_index_is_refused_and_untouched(self):
        self.put("b.md", note("b"))
        data = b"- [foo-bar](foo-bar.md) \xe9\n"
        p = self.raw("MEMORY.md", data)
        code, out = self.run_cli("apply", "--memory", str(self.mem), "--apply")
        self.assertEqual(code, 1)
        self.assertIn("MEMORY.md", out)
        self.assertEqual(p.read_bytes(), data)


class LostUpdate(Fixture):
    def edit_after_every_load(self, rel):
        real = dream.load
        path = self.mem / rel

        def load(mem):
            got = real(mem)
            with open(path, "a", encoding="utf-8") as fh:
                fh.write("\nOTHER SESSION\n")
            return got
        dream.load = load
        self.addCleanup(setattr, dream, "load", real)

    def test_fix_links_skips_a_note_changed_after_it_was_read(self):
        self.put("foo-bar.md", note("foo-bar"))
        self.put("src.md", note("src", body="[[foo_bar]]"))
        other = self.put("other.md", note("other", body="[[foo_bar]]"))
        self.edit_after_every_load("src.md")
        code, out = self.run_cli("fix-links", "--memory", str(self.mem), "--apply")
        self.assertEqual(code, 1)
        self.assertIn("src.md", out)
        self.assertIn("changed", out)
        text = (self.mem / "src.md").read_text()
        self.assertIn("OTHER SESSION", text)
        self.assertIn("[[foo_bar]]", text)
        self.assertIn("[[foo-bar]]", other.read_text())

    def test_apply_skips_an_index_changed_after_it_was_read(self):
        self.put("a.md", note("a"))
        self.put("b.md", note("b"))
        self.put("MEMORY.md", "- [a](a.md) \u2014 x\n")
        self.edit_after_every_load("MEMORY.md")
        code, out = self.run_cli("apply", "--memory", str(self.mem), "--apply")
        self.assertEqual(code, 1)
        self.assertIn("MEMORY.md", out)
        got = (self.mem / "MEMORY.md").read_text()
        self.assertIn("OTHER SESSION", got)
        self.assertNotIn("b.md", got)


class ApplyKeepsLines(Fixture):
    INDEX = ("# Heading\n- [a](a.md) \u2014 keep\n- [old](archive/old.md) \u2014 retired earlier\n"
             "- [gone](gone.md) \u2014 dead\n- [a again](a.md) \u2014 dup\n- [x](../x.md) \u2014 outside\n"
             "hand written line\n")

    def setUp(self):
        super().setUp()
        self.put("a.md", note("a"))
        self.put("my note.md", note("my note"))
        self.put("b (1).md", note("b one"))
        self.put("archive/old.md", note("old"))
        self.put("MEMORY.md", self.INDEX)

    def test_dry_run_lists_lines_it_cannot_match(self):
        code, out = self.run_cli("apply", "--memory", str(self.mem))
        for want in ("archive/old.md", "gone.md", "../x.md", "dup"):
            self.assertIn(want, out)

    def test_apply_drops_no_line_and_is_idempotent(self):
        code, out = self.run_cli("apply", "--memory", str(self.mem), "--apply")
        self.assertEqual(code, 0, out)
        first = (self.mem / "MEMORY.md").read_text()
        self.assertTrue(first.startswith(self.INDEX))
        self.assertEqual(first.count("(my note.md)"), 1)
        self.assertEqual(first.count("(b (1).md)"), 1)
        code, out = self.run_cli("apply", "--memory", str(self.mem), "--apply")
        self.assertIn("no change", out)
        self.assertEqual((self.mem / "MEMORY.md").read_text(), first)

class RetireAtomic(Fixture):
    def setUp(self):
        super().setUp()
        self.put("a.md", note("a"))
        self.put("sub/b.md", note("b"))
        self.put("c.md", note("c", body="see [[a]]"))
        self.put("MEMORY.md", "- [a](a.md) \u2014 x\n- [b](sub/b.md) \u2014 y\n- [c](c.md) \u2014 z\n")

    def test_blocked_destination_moves_nothing(self):
        self.put("archive/sub", "iamafile")
        before = self.tree(self.mem)
        code, out = self.run_cli("retire", "--memory", str(self.mem), "--note", "a", "--note", "sub/b.md", "--apply")
        self.assertEqual(code, 1)
        self.assertNotIn("Traceback", out)
        self.assertEqual(self.tree(self.mem), before)

    def test_index_changed_after_read_rolls_the_moves_back(self):
        real = dream.load
        path = self.mem / "MEMORY.md"

        def load(mem):
            got = real(mem)
            with open(path, "a", encoding="utf-8") as fh:
                fh.write("- [new](a.md) \u2014 other session\n")
            return got
        dream.load = load
        self.addCleanup(setattr, dream, "load", real)
        code, out = self.run_cli("retire", "--memory", str(self.mem), "--note", "a", "--apply")
        self.assertEqual(code, 1)
        self.assertTrue((self.mem / "a.md").is_file())
        self.assertFalse((self.mem / "archive" / "a.md").exists())
        self.assertIn("other session", path.read_text())

    def test_repeated_note_is_planned_once(self):
        code, out = self.run_cli("retire", "--memory", str(self.mem), "--note", "a", "--note", "a")
        self.assertEqual(out.count("-> archive/"), 1)
        self.assertNotIn("a-2", out)

    def test_warns_about_wiki_links_left_dangling(self):
        code, out = self.run_cli("retire", "--memory", str(self.mem), "--note", "a")
        self.assertIn("c.md", out)
        self.assertIn("still link", out)


class WorkspaceMemoryPath(Fixture):
    def lint_ws(self, toml):
        ws = self.root / "ws"
        self.put(".claude/dream.toml", toml, base=ws)
        self.put("a.md", note("a"), base=self.root / "outside" / "x")
        return self.run_cli("lint", "--workspace", str(ws))

    def test_escaping_and_absolute_paths_are_refused(self):
        for toml in ('memory = "../outside/x"\n', f'memory = "{self.root}/outside/x"\n', 'memory = "~/x"\n'):
            code, out = self.lint_ws(toml)
            self.assertEqual(code, 2, toml)
            self.assertIn("memory", out)

    def test_wrong_type_is_a_message_not_a_traceback(self):
        code, out = self.lint_ws("memory = 5\n")
        self.assertEqual(code, 2)
        self.assertIn("memory must be a string", out)


class ProposeStaging(Fixture):
    def test_staging_is_private_and_warns_about_a_curated_secret(self):
        self.put("a.md", note("a"))
        self.put("MEMORY.md", "- [a](a.md) \u2014 token ghp_" + "a" * 36 + "\n")
        code, out = self.run_cli("propose", "--memory", str(self.mem))
        self.assertEqual(code, 0)
        self.assertIn("secret-like", out)
        self.assertNotIn("ghp_a", out)
        stage = self.root / "proj" / "dream-staging"
        self.assertEqual(oct(stage.stat().st_mode & 0o777), "0o700")
        self.assertEqual(oct((stage / "MEMORY.md").stat().st_mode & 0o777), "0o600")


class DeadLinkOutput(Fixture):
    def test_secret_like_link_text_is_not_printed(self):
        self.put("a.md", note("a", body='see [[ "$T" == "ghp_' + "q" * 36 + '" ]]'))
        for cmd in ("lint", "fix-links"):
            code, out = self.run_cli(cmd, "--memory", str(self.mem))
            self.assertNotIn("ghp_q", out)

    def test_links_in_code_are_not_links(self):
        self.put("a.md", note("a", body="```\n[[ -f x ]]\n```\nand `[[inline]]`"))
        r, _, _ = dream.lint(str(self.mem))
        self.assertEqual(r["dead"], [])


class FixLinksScope(Fixture):
    def test_code_is_left_alone_and_frontmatter_is_fixed(self):
        self.put("foo-bar.md", note("foo-bar"))
        src = self.put("src.md", "---\nname: src\ndescription: see [[foo_bar]]\n---\n\n```\nexample [[foo_bar]]\n```\nuse `[[foo_bar]]` or [[foo_bar]]\n")
        code, out = self.run_cli("fix-links", "--memory", str(self.mem), "--apply")
        self.assertEqual(code, 0, out)
        self.assertEqual(src.read_text(), "---\nname: src\ndescription: see [[foo-bar]]\n---\n\n```\nexample [[foo_bar]]\n```\nuse `[[foo_bar]]` or [[foo-bar]]\n")

    def test_ambiguous_basename_is_written_as_the_full_stem(self):
        self.put("sub/a.md", note("a1"))
        self.put("other/a.md", note("a2"))
        src = self.put("src.md", note("src", body="[[Sub/A]]"))
        code, out = self.run_cli("fix-links", "--memory", str(self.mem), "--apply")
        self.assertIn("[[sub/a]]", src.read_text())
        _, notes, _ = dream.lint(str(self.mem))
        self.assertEqual(dream.link_plan(notes)["fix"], [])


class Unusual(Fixture):
    def test_broken_symlink_does_not_abort_lint(self):
        self.put("a.md", note("a"))
        os.symlink("/nonexistent/x", self.mem / "dead.md")
        code, out = self.run_cli("lint", "--memory", str(self.mem))
        self.assertEqual(code, 0, out)
        self.assertIn("dead.md", out)

    def test_symlinked_note_is_never_replaced(self):
        self.put("foo-bar.md", note("foo-bar"))
        real = self.put("real.md", note("real", body="[[foo_bar]]"), base=self.root / "shared")
        os.symlink(real, self.mem / "link.md")
        code, out = self.run_cli("fix-links", "--memory", str(self.mem), "--apply")
        self.assertEqual(code, 1)
        self.assertIn("link.md", out)
        self.assertTrue((self.mem / "link.md").is_symlink())
        self.assertIn("[[foo_bar]]", real.read_text())

    def test_file_mode_survives_a_rewrite(self):
        self.put("foo-bar.md", note("foo-bar"))
        src = self.put("src.md", note("src", body="[[foo_bar]]"))
        os.chmod(src, 0o640)
        self.run_cli("fix-links", "--memory", str(self.mem), "--apply")
        self.assertIn("[[foo-bar]]", src.read_text())
        self.assertEqual(oct(src.stat().st_mode & 0o777), "0o640")

    def test_unreadable_file_makes_snapshot_fail_cleanly_without_a_partial_archive(self):
        self.put("a.md", note("a"))
        bad = self.put("secret.txt", "x")
        os.chmod(bad, 0)
        self.addCleanup(os.chmod, bad, 0o600)
        code, out = self.run_cli("snapshot", "--memory", str(self.mem))
        self.assertEqual(code, 2)
        self.assertEqual(list((self.root / "proj" / "memory-backups").glob("*")), [])

    def test_snapshot_never_overwrites_an_existing_backup(self):
        self.put("a.md", note("a"))
        real_exists = os.path.exists
        os.path.exists = lambda p: False if str(p).endswith(".tar.gz") else real_exists(p)
        self.addCleanup(setattr, os.path, "exists", real_exists)
        first = dream.snapshot(str(self.mem))
        second = dream.snapshot(str(self.mem))
        self.assertNotEqual(first, second)


class SmallerFindings(Fixture):
    def test_unicode_line_separators_do_not_split_an_index_line(self):
        self.put("a.md", note("a"))
        line = "- [a](a.md) \u2014 has \u2028sep and \x0cff and \x85"
        self.put("MEMORY.md", line + "\n")
        r, _, _ = dream.lint(str(self.mem))
        self.assertEqual(r["lines"], 1)
        self.run_cli("apply", "--memory", str(self.mem), "--apply")
        self.assertEqual((self.mem / "MEMORY.md").read_text(), line + "\n")

    def test_file_cap_counts_lines_like_the_index_does(self):
        ws = self.root / "ws"
        self.put("S.md", "a\u2028b\x0cc\n", base=ws)
        self.put(".claude/dream.toml", '[[file_cap]]\npath = "S.md"\nmax_lines = 1\n', base=ws)
        code, out = self.run_cli("rules", str(ws))
        self.assertEqual(code, 0, out)

    def test_rules_without_path_are_rejected_not_crashed(self):
        ws = self.root / "ws"
        ws.mkdir()
        for kind, extra in (("file_cap", "max_lines = 5"), ("row_cap", "max_bytes = 5")):
            self.put(".claude/dream.toml", f"[[{kind}]]\n{extra}\n", base=ws)
            code, out = self.run_cli("rules", str(ws))
            self.assertEqual(code, 2, kind)
            self.assertIn("needs path", out)

    def test_superseded_null_and_empty_are_not_pointers(self):
        ws = self.root / "ws"
        self.put("h/a.md", "---\nsuperseded_by: null\n---\n", base=ws)
        self.put("h/b.md", "---\nsuperseded_by: ~\n---\n", base=ws)
        self.put("h/c.md", "---\nsuperseded_by: []\n---\n", base=ws)
        self.put(".claude/dream.toml", '[[superseded]]\npath = "h/*.md"\n', base=ws)
        code, out = self.run_cli("rules", str(ws))
        self.assertEqual(code, 0, out)
        self.assertIn("0 superseded pointers", out)

    def test_bom_does_not_hide_frontmatter(self):
        self.put("a.md", "\ufeff" + note("a", desc="real desc"))
        _, notes, index = dream.lint(str(self.mem))
        text, need = dream.propose(notes, index)
        self.assertIn("real desc", text)

    def test_note_listed_inside_and_past_the_limit_is_not_cut(self):
        lines = ["- [n0](n0.md) \u2014 first"] + [f"- [n{i}](n{i}.md) \u2014 h" for i in range(1, 200)]
        lines.append("- [n0 again](n0.md) \u2014 late")
        for i in range(200):
            self.put(f"n{i}.md", note(f"n{i}"))
        self.put("MEMORY.md", "\n".join(lines) + "\n")
        r, _, _ = dream.lint(str(self.mem))
        self.assertEqual(r["cut"], [])


if __name__ == "__main__":
    unittest.main()
