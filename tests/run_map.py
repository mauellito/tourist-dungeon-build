#!/usr/bin/env python3
"""Visual map-mode tests (run in headless Chrome against the real engine).

Concatenates engine/rng.js + interpreter.js + mapmode.js with the test cases,
runs TD_MAP_TESTS() in headless Chrome, and reports pass/fail.
Run:  python tests/run_map.py
"""
import html
import os
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENGINE = os.path.join(ROOT, "engine")
TMPDIR = os.path.join(ROOT, "tests", ".tmp")
ENGINE_FILES = ["rng.js", "resolve.js", "stats.js", "interpreter.js", "vaults.js", "checker.js", "generator.js", "mapmode.js"]
TESTS = os.path.join(ROOT, "tests", "mapmode.tests.js")

CHROME_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
]

REPORTER = """
<script>
(function(){
  var out = document.getElementById('out');
  try {
    var r = TD_MAP_TESTS();
    var lines = r.results.map(function(x){ return (x.ok?'PASS ':'FAIL ') + x.name + (x.ok?'':'  ::  ' + x.err); });
    lines.push('SUMMARY ' + r.pass + '/' + (r.pass + r.fail));
    out.textContent = lines.join('\\n');
    document.title = 'TD_MAP pass=' + r.pass + ' fail=' + r.fail;
  } catch (e) {
    out.textContent = 'HARNESS_ERROR ' + (e && e.stack ? e.stack : e);
    document.title = 'TD_MAP harness_error';
  }
})();
</script>
"""


def find_chrome():
    for p in CHROME_CANDIDATES:
        if os.path.exists(p):
            return p
    for n in ("chrome", "chrome.exe", "msedge", "msedge.exe"):
        f = shutil.which(n)
        if f:
            return f
    return None


def main():
    chrome = find_chrome()
    if not chrome:
        sys.exit("FATAL: no Chrome/Edge found.")
    parts = ['<!doctype html><html><head><meta charset="utf-8"><title>pending</title></head>',
             '<body><pre id="out">pending</pre>']
    for fn in ENGINE_FILES:
        with open(os.path.join(ENGINE, fn), "r", encoding="utf-8") as f:
            parts.append("<script>\n" + f.read() + "\n</script>")
    with open(TESTS, "r", encoding="utf-8") as f:
        parts.append("<script>\n" + f.read() + "\n</script>")
    parts.append(REPORTER)
    parts.append("</body></html>")

    os.makedirs(TMPDIR, exist_ok=True)
    runner = os.path.join(TMPDIR, "map_runner.html")
    with open(runner, "w", encoding="utf-8") as f:
        f.write("\n".join(parts))

    user_data = tempfile.mkdtemp(prefix="td_map_")
    url = "file:///" + runner.replace("\\", "/")
    cmd = [chrome, "--headless", "--disable-gpu", "--no-sandbox",
           "--user-data-dir=" + user_data, "--dump-dom", url]
    try:
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=120)
    finally:
        shutil.rmtree(user_data, ignore_errors=True)
    dom = proc.stdout.decode("utf-8", "replace")
    title = (re.search(r"<title>(.*?)</title>", dom, re.DOTALL) or [None, ""])[1]
    m = re.search(r'<pre id="out">(.*?)</pre>', dom, re.DOTALL)
    report = html.unescape(m.group(1)) if m else "(no output)\n" + dom[:1500]
    print(report)
    print("-" * 60)
    fm = re.search(r"fail=(\d+)", title)
    if "harness_error" in title or not fm:
        print("RESULT: HARNESS ERROR")
        return 2
    fails = int(fm.group(1))
    pm = re.search(r"pass=(\d+)", title)
    print("RESULT: {} passed, {} failed".format(int(pm.group(1)) if pm else 0, fails))
    return 0 if fails == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
