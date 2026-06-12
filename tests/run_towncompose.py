#!/usr/bin/env python3
"""Town composition tests — the figure-ground generator against the Town
Composition Law v1 + Amendment 1, in headless Chrome.

  python tests/run_towncompose.py
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
ENGINE_FILES = ["rng.js", "towngen.js"]
TESTS = os.path.join(ROOT, "tests", "towncompose.tests.js")
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
    var r = TD_TOWN_TESTS();
    var lines = r.results.map(function(x){ return (x.ok?'PASS ':'FAIL ') + x.name + (x.ok?'':'  ::  ' + x.err); });
    lines.push('SUMMARY ' + r.pass + '/' + (r.pass + r.fail));
    out.textContent = lines.join('\\n');
    document.title = 'TD_TOWN pass=' + r.pass + ' fail=' + r.fail;
  } catch (e) { out.textContent = 'HARNESS_ERROR ' + (e && e.stack ? e.stack : e); document.title = 'TD_TOWN harness_error'; }
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
    parts = ['<!doctype html><html><head><meta charset="utf-8"><title>pending</title></head>', '<body><pre id="out">pending</pre>']
    for fn in ENGINE_FILES:
        with open(os.path.join(ENGINE, fn), "r", encoding="utf-8") as f:
            parts.append("<script>\n" + f.read() + "\n</script>")
    with open(TESTS, "r", encoding="utf-8") as f:
        parts.append("<script>\n" + f.read() + "\n</script>")
    parts.append(REPORTER)
    parts.append("</body></html>")
    os.makedirs(TMPDIR, exist_ok=True)
    runner = os.path.join(TMPDIR, "towncompose_runner.html")
    with open(runner, "w", encoding="utf-8") as f:
        f.write("\n".join(parts))
    udd = tempfile.mkdtemp(prefix="td_town_")
    url = "file:///" + runner.replace("\\", "/")
    try:
        proc = subprocess.run([chrome, "--headless", "--disable-gpu", "--no-sandbox", "--user-data-dir=" + udd, "--dump-dom", url],
                              stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=120)
    finally:
        shutil.rmtree(udd, ignore_errors=True)
    dom = proc.stdout.decode("utf-8", "replace")
    title = (re.search(r"<title>(.*?)</title>", dom, re.DOTALL) or [None, ""])[1]
    m = re.search(r'<pre id="out">(.*?)</pre>', dom, re.DOTALL)
    print(html.unescape(m.group(1)) if m else "(no output)")
    fm = re.search(r"fail=(\d+)", title)
    if "harness_error" in title or not fm:
        print("RESULT: HARNESS ERROR")
        return 2
    n = int(fm.group(1))
    print("RESULT: %s" % ("all town-composition laws hold" if n == 0 else (str(n) + " failed")))
    return 0 if n == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
