# Hidden test harness for the palindrome demo

The strategy's "Initialize" instruction reads this file, extracts the
fenced Python block below, and writes it to
`workspace/tests/test_palindrome.py`. The evaluator dynamic runs
`python workspace/tests/test_palindrome.py` via the `bash` tool and
interprets exit status 0 as `pass`, anything else as `fail`.

```python
import sys
sys.path.insert(0, 'workspace')
from is_palindrome import is_palindrome

cases = [
    ("", True),
    ("a", True),
    ("aa", True),
    ("ab", False),
    ("A man, a plan, a canal: Panama", True),
    ("No 'x' in Nixon", True),
    ("race a car", False),
    ("12321", True),
    ("123456", False),
    ("Was it a car or a cat I saw?", True),
    ("Not a palindrome!", False),
]

failures = []
for i, (s, expected) in enumerate(cases):
    try:
        actual = is_palindrome(s)
    except Exception as e:
        failures.append(f"case {i}: {s!r} raised {type(e).__name__}: {e}")
        continue
    if actual != expected:
        failures.append(f"case {i}: is_palindrome({s!r}) = {actual!r}, expected {expected!r}")

if failures:
    for line in failures:
        print(line)
    sys.exit(1)
print("all cases passed")
sys.exit(0)
```
