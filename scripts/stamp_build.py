#!/usr/bin/env python3
"""Stamp a CONTENT-HASH cache-buster into engine/play-map.html's window.__BUILD.

  python scripts/stamp_build.py

The token is a short SHA-1 over the EXACT files the dynamic loader serves (its `var files = [...]`
list) plus play-map.html itself with the __BUILD line normalised out (so it never hashes itself).

Why content-hash, not the git short hash (the old approach, which broke):
  * A file cannot contain the hash of the commit that includes it -> __BUILD always lagged HEAD by the
    dedicated stamp commit (off-by-one).
  * The PUBLIC mirror is a SEPARATE repo with DIFFERENT commit hashes, so a private git hash in __BUILD
    could NEVER equal the mirror's HEAD. (That was the real "__BUILD != HEAD on the mirror" bug.)
A content hash sidesteps both: it is IDENTICAL on both repos (same served files), it CHANGES whenever any
served file changes (the only property cache-busting needs), and it is VERIFIABLE on the mirror by
recomputing this hash. Run automatically by the post-commit hook (scripts/githooks/post-commit).
"""
import hashlib
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENGINE = os.path.join(ROOT, "engine")
PAGE = os.path.join(ENGINE, "play-map.html")
BUILD_RE = r'(window\.__BUILD\s*=\s*")[^"]*(")'


def loader_files(page):
    m = re.search(r"var files = \[(.*?)\];", page, re.DOTALL)
    return re.findall(r'"([^"]+\.js)"', m.group(1)) if m else []


def content_token():
    page = open(PAGE, encoding="utf-8").read()
    h = hashlib.sha1()
    for f in loader_files(page):                      # the exact engine scripts the browser loads, in order
        p = os.path.join(ENGINE, f)
        if os.path.exists(p):
            h.update(("\n--" + f + "--\n").encode("utf-8"))
            with open(p, "rb") as fp:
                h.update(fp.read())
    norm = re.sub(BUILD_RE, r'\g<1>X\g<2>', page)     # the host page, minus its own __BUILD value (no self-reference)
    h.update(norm.encode("utf-8"))
    return h.hexdigest()[:8]


def main():
    token = content_token()
    if "--check" in sys.argv:                         # verify mode: print the expected token (QB can compare to __BUILD)
        print(token)
        cur = re.search(BUILD_RE.replace("[^\"]*", "([^\"]*)"), open(PAGE, encoding="utf-8").read())
        return
    src = open(PAGE, encoding="utf-8").read()
    old = re.search(r'window\.__BUILD\s*=\s*"([^"]*)"', src)
    old = old.group(1) if old else None
    if old == token:
        print("build token already current: " + token)
        return
    new, n = re.subn(BUILD_RE, r"\g<1>" + token + r"\g<2>", src)
    if n != 1:
        sys.exit("expected exactly one window.__BUILD token, found {}".format(n))
    open(PAGE, "w", encoding="utf-8", newline="").write(new)
    print("stamped build token: {} -> {} (content hash)".format(old, token))


if __name__ == "__main__":
    main()
