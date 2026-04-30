# wc-plus

A Node.js implementation of the Unix `wc` (word count) utility with JSON output support.

## Installation

```bash
npm install
```

## Usage

### Count lines, words, and bytes

```bash
wc-plus <file>
```

Output format: `<lines> <words> <bytes> <file>` (tab-separated)

Example:
```bash
$ wc-plus README.md
10	45	320	README.md
```

### JSON output

```bash
wc-plus --json <file>
```

Example:
```bash
$ wc-plus --json README.md
{"lines":10,"words":45,"bytes":320,"file":"README.md"}
```

### Show help

```bash
wc-plus --help
```

## Behavior

- Counts lines as the number of newline characters in the file
- Counts words as whitespace-separated tokens
- Counts bytes as the UTF-8 encoded file size
- Returns exit code 0 on success
- Returns exit code 1 if the file does not exist (with error message to stderr)

## Testing

```bash
npm test
```
