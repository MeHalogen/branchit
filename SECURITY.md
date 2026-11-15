# Security policy

## Supported versions

The latest minor release receives security fixes.

## Reporting a vulnerability

Please **do not open a public issue**. Use GitHub's private vulnerability
reporting: **Security → Report a vulnerability** on
https://github.com/MeHalogen/branchit. You should get a response within a
week.

Useful to include: the Branchit version (`branchit --version`), OS, Git
version (`branchit doctor` prints all three), and a minimal repository or
config that reproduces the problem.

## What counts

Branchit runs `git` and, after explicit trust, commands a repository or user
configures. In scope, for example:

- any way a repository's contents (branch names, file names, config, commit
  messages, remote URLs) cause a command to run without the trust prompt;
- shell or argument injection into `git` or a configured command;
- terminal escape sequences from repository data reaching the terminal
  unsanitized;
- an undo or sweep that deletes work it reported as safe.
