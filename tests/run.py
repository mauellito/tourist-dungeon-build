#!/usr/bin/env python3
"""Tourist Dungeon P1 test runner.

No Node on this machine, so we run the game's REAL core logic in headless
Chrome. Steps:
  1. extract the pure core from the single-file game (between TD_CORE markers),
  2. inject it + the JS test cases into a tiny generated page,
  3. run that page in headless Chrome with --dump-dom,
  4. parse PASS/FAIL out of the serialized DOM,
  5. exit non-zero if anything failed.

Usage:  python tests/run.py
"""
import html
import os
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GAME = os.path.join(ROOT, "prototype", "tourist-dungeon-p1.html")
TESTS = os.path.join(ROOT, "tests", "p1.tests.js")
TMPDIR = os.path.join(ROOT, "tests", ".tmp")

CHROME_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
]


def find_chrome():
    for p in CHROME_CANDIDATES:
        if os.path.exists(p):
            return p
    for name in ("chrome", "chrome.exe", "msedge", "msedge.exe"):
        found = shutil.which(name)
        if found:
            return found
    return None


def extract_core(game_src):
    m = re.search(r"/\* ?===TD_CORE_START=== ?\*/(.*?)/\* ?===TD_CORE_END=== ?\*/",
                  game_src, re.DOTALL)
    if not m:
        sys.exit("FATAL: could not find TD_CORE markers in the game file.")
    return m.group(1)


RUNNER_TEMPLATE = """<!doctype html><html><head><meta charset="utf-8"><title>pending</title></head>
<body><pre id="out">pending</pre>
<script>
{core}
</script>
<script>
{tests}
</script>
<script>
(function(){{
  var out = document.getElementById('out');
  try {{
    if (typeof TD_TESTS !== 'function') throw new Error('TD_TESTS not defined');
    var r = TD_TESTS(TD_CORE);
    var lines = r.results.map(function(x){{
      return (x.ok ? 'PASS ' : 'FAIL ') + x.name + (x.ok ? '' : '  ::  ' + x.err);
    }});
    lines.push('SUMMARY ' + r.pass + '/' + (r.pass + r.fail));
    out.textContent = lines.join('\\n');
    document.title = 'TD_RESULT pass=' + r.pass + ' fail=' + r.fail;
  }} catch (e) {{
    out.textContent = 'HARNESS_ERROR ' + (e && e.stack ? e.stack : e);
    document.title = 'TD_RESULT harness_error';
  }}
}})();
</script>
</body></html>
"""


def main():
    chrome = find_chrome()
    if not chrome:
        sys.exit("FATAL: no Chrome/Edge found to run the tests.")
    with open(GAME, "r", encoding="utf-8") as f:
        game_src = f.read()
    with open(TESTS, "r", encoding="utf-8") as f:
        tests_src = f.read()

    core = extract_core(game_src)
    page = RUNNER_TEMPLATE.format(core=core, tests=tests_src)

    os.makedirs(TMPDIR, exist_ok=True)
    runner_path = os.path.join(TMPDIR, "runner.html")
    with open(runner_path, "w", encoding="utf-8") as f:
        f.write(page)

    user_data = tempfile.mkdtemp(prefix="td_chrome_")
    file_url = "file:///" + runner_path.replace("\\", "/")
    cmd = [chrome, "--headless", "--disable-gpu", "--no-sandbox",
           "--user-data-dir=" + user_data, "--dump-dom", file_url]
    try:
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                              timeout=60)
    finally:
        shutil.rmtree(user_data, ignore_errors=True)

    dom = proc.stdout.decode("utf-8", "replace")

    # Pull the detailed report out of <pre id="out">.
    m = re.search(r'<pre id="out">(.*?)</pre>', dom, re.DOTALL)
    report = html.unescape(m.group(1)) if m else "(no #out block found)\n" + dom[:2000]
    title = re.search(r"<title>(.*?)</title>", dom, re.DOTALL)
    title = title.group(1) if title else ""

    print(report)
    print("-" * 60)

    fail_match = re.search(r"fail=(\d+)", title)
    if "harness_error" in title or not fail_match:
        print("RESULT: HARNESS ERROR")
        return 2
    fails = int(fail_match.group(1))
    pass_match = re.search(r"pass=(\d+)", title)
    passes = int(pass_match.group(1)) if pass_match else 0
    print("RESULT: {} passed, {} failed".format(passes, fails))
    return 0 if fails == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
