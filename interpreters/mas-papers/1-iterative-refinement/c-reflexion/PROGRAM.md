# Goal

Write a Python function `is_palindrome(s: str) -> bool` that returns `True` when `s` is a palindrome after normalising: the comparison must ignore letter case and ignore non-alphanumeric characters.

Place the implementation at `workspace/is_palindrome.py` so the evaluator's test harness can import it.

## Acceptance Criterion

1. The file `workspace/is_palindrome.py` exists and defines a function `is_palindrome(s: str) -> bool`.
2. Running `python workspace/tests/test_palindrome.py` exits with status 0.

The evaluator will run the test file to produce its verdict. The test file (with hidden edge cases) must be materialised under `workspace/tests/test_palindrome.py` during initialisation — the strategy's "Initialize" instruction reads `test_palindrome.md` from the instance directory, extracts the fenced Python code block, and writes it to that path. Do not modify the test file afterwards.
