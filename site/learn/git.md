---
title: "Git and GitHub"
description: "Track every change to your code with Git, work on branches, merge them and resolve a real conflict, keep node_modules and secrets out of your repository, and share your work through GitHub with remotes and pull requests."
source: https://zudojs.oyinlola.site/learn/git
---

LESSON 30 OF 84

Backend fundamentals Foundation

# Git and GitHub

Track every change to your code with Git, work on branches, merge them and resolve a real conflict, keep node_modules and secrets out of your repository, and share your work through GitHub with remotes and pull requests.

- **40 min** to read and try
- **You need:** Git installed, and the Task API folder from earlier lessons
- **You build:** A Git repository for the Task API with a clean history, a .gitignore that protects your secrets, and a GitHub remote

  [Test yourself](#test)

## Why version control

You change a file, the server breaks, and you cannot remember what the working version looked like. Or two people edit the same project and overwrite each other's work. **Version control** solves both: it records every change, who made it and why, lets you go back to any earlier state, and merges the work of many people.

**Git** is the version control system almost everyone uses. It runs on your computer. **GitHub** is a website that stores Git projects online so a team can share them; GitLab and Bitbucket are similar. Git works without GitHub, so start with Git.

Install it from `git-scm.com` (Windows), with `xcode-select --install` or `brew install git` (macOS), or with `sudo apt install git` (Linux). Then tell Git who you are. Every change you record carries this name and e-mail:

Terminal on your computer

```bash
$ git --version
git version 2.53.0
$ git config --global user.name "Ada Lovelace"
$ git config --global user.email "ada@example.com"
$ git config --global init.defaultBranch main
```

Use your own name and e-mail. `--global` saves the settings for every project on this computer. The last line names the first branch `main`, which GitHub also uses.

## Repositories and commits

A **repository** (repo) is a project folder whose history Git tracks. `git init` turns a folder into one by creating a hidden `.git` folder, where the whole history lives. Here the folder holds a tiny `server.js` and a `README.md`:

Terminal on your computer

```bash
$ mkdir task-api
$ cd task-api
$ git init
Initialized empty Git repository in ~/task-api/.git/
$ git status
On branch main

No commits yet

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	README.md
	server.js

nothing added to commit but untracked files present (use "git add" to track)
```

`git status` is the command you will type most. It says the two files are **untracked**: Git sees them but is not recording them yet.

Recording a change takes two steps. `git add` puts files on the **staging area**, the list of what goes into the next snapshot. `git commit` takes the snapshot, a **commit**, with a message saying what changed:

Terminal on your computer

```bash
$ git add server.js README.md
$ git status --short
A  README.md
A  server.js
$ git commit -m "Add the first server"
[main (root-commit) a754e78] Add the first server
 2 files changed, 11 insertions(+)
 create mode 100644 README.md
 create mode 100644 server.js
$ git log --oneline
a754e78 Add the first server
```

`A` means "added to the staging area". `a754e78` is the start of the commit's **hash**, a unique id Git computes from the content; yours will differ. Write messages that say what the commit does, in a few words: "Add the first server", not "stuff" or "fix".

> TIP
>
> Commit small and often: one commit per finished step. A history of small commits is easy to read, and easy to undo one piece at a time.

## .gitignore: node_modules and .env

Two things must never go into a repository:

- `node_modules/`: thousands of files that `npm install` recreates from `package.json` and `package-lock.json` at any time.
- `.env`: the file where you keep **secrets** for your computer, such as the database password. Anyone who can read the repository could read them.

Install `pg` from [the last lesson](https://zudojs.oyinlola.site/learn/sql-advanced) and put the database URL into `.env`. The value is built from the `PGPASSWORD` variable, so the password is never typed out:

Terminal on your computer

```bash
$ npm init -y
Wrote to ~/task-api/package.json:
…
$ npm pkg set type=module
$ npm install pg

added 14 packages, and audited 15 packages in 6s

found 0 vulnerabilities
$ echo "DATABASE_URL=postgres://postgres:$PGPASSWORD@localhost:5434/taskdb" > .env
$ git status
On branch main
Untracked files:
  (use "git add <file>..." to include in what will be committed)
	.env
	node_modules/
	package-lock.json
	package.json

nothing added to commit but untracked files present (use "git add" to track)
```

Git is offering to track `.env` and `node_modules/`. One careless `git add .` would record both. Create a file named `.gitignore` in the project folder, with one pattern per line, **before** that happens:

Terminal on your computer

```bash
$ cat .gitignore
node_modules/
.env
$ git status
On branch main
Untracked files:
  (use "git add <file>..." to include in what will be committed)
	.gitignore
	package-lock.json
	package.json

nothing added to commit but untracked files present (use "git add" to track)
$ git check-ignore -v .env node_modules
.gitignore:2:.env	.env
.gitignore:1:node_modules/	node_modules
$ git add .
$ git commit -m "Add package.json and .gitignore"
[main 3199366] Add package.json and .gitignore
 3 files changed, 181 insertions(+)
 create mode 100644 .gitignore
 create mode 100644 package-lock.json
 create mode 100644 package.json
```

Both are gone from the list. `git check-ignore -v` explains which line of `.gitignore` hides a file, which helps when you wonder why a file is not showing up. `.gitignore` itself *is* committed, so everyone on the team gets the same rules.

Your code reads the secret from the environment, never from a string in a file you commit. A good habit is to fail at startup, with a clear message, when a required variable is missing:

config.jsNode.js only

```ts
function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable ${name}. Add it to .env or your shell.`);
  }
  return value;
}

try {
  const databaseUrl = required("DATABASE_URL");
  console.log("Connecting to", new URL(databaseUrl).host);
} catch (error) {
  console.log(error.message);
}
```

Output of `node config.js`

```ts
Missing environment variable DATABASE_URL. Add it to .env or your shell.
```

Here the variable is not set, so the program says exactly what is missing instead of failing later with a confusing database error. When it is set, the program logs only the host, never the whole URL, which contains the password. Node.js can load a `.env` file for you: `node --env-file=.env server.js`. Many projects also commit a `.env.example` with the variable names and no real values, so a new developer knows what to fill in.

## Branches and merging

A **branch** is a separate line of work. You make a branch for a feature, commit on it without disturbing `main`, and **merge** it back when it is done. Make a branch that reads the port from the `PORT` environment variable, change the last line of `server.js` in your editor, and commit:

Terminal on your computer

```bash
$ git switch -c port-from-env
Switched to a new branch 'port-from-env'
$ git diff
diff --git a/server.js b/server.js
index 4bf9816..4685a08 100644
--- a/server.js
+++ b/server.js
@@ -5,4 +5,4 @@ const server = http.createServer((req, res) => {
   res.end(JSON.stringify({ status: "ok" }));
 });

-server.listen(3000);
+server.listen(Number(process.env.PORT ?? 3000));
$ git commit -am "Read the port from PORT"
[port-from-env 9970398] Read the port from PORT
 1 file changed, 1 insertion(+), 1 deletion(-)
```

`git switch -c` creates a branch and moves to it. `git diff` shows what changed and is not staged yet: `-` lines were removed, `+` lines added. `commit -a` stages every tracked file that changed, so you can skip `git add` for files Git already knows.

Meanwhile, someone changes the **same line** on `main`, to log a message when the server starts:

Terminal on your computer

```bash
$ git switch main
Switched to branch 'main'
$ git commit -am "Log when the server starts"
[main 9a2086f] Log when the server starts
 1 file changed, 1 insertion(+), 1 deletion(-)
$ git log --oneline --graph --all
* 9a2086f Log when the server starts
| * 9970398 Read the port from PORT
|/
* 3199366 Add package.json and .gitignore
* a754e78 Add the first server
```

The graph shows the two lines of work splitting after `3199366`. Now merge the branch into `main`:

Terminal on your computer

```bash
$ git merge port-from-env
Auto-merging server.js
CONFLICT (content): Merge conflict in server.js
Automatic merge failed; fix conflicts and then commit the result.
$ git status
On branch main
You have unmerged paths.
  (fix conflicts and run "git commit")
  (use "git merge --abort" to abort the merge)

Unmerged paths:
  (use "git add <file>..." to mark resolution)
	both modified:   server.js

no changes added to commit (use "git add" and/or "git commit -a")
$ cat server.js
import http from "node:http";

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "ok" }));
});

<<<<<<< HEAD
server.listen(3000, () => console.log("Listening on port 3000"));
=======
server.listen(Number(process.env.PORT ?? 3000));
>>>>>>> port-from-env
```

### Resolving the conflict

When both sides changed different lines, Git merges by itself. Here both changed the same line, so Git cannot know which one you want. That is a **merge conflict**, and it is normal, not an error. Git wrote both versions into the file between markers:

- From `<<<<<<< HEAD` to `=======`: the version on your current branch, `main`.
- From `=======` to `>>>>>>> port-from-env`: the version on the branch you are merging.

Here you want both ideas: the port from the environment *and* the log message. Edit the file so it holds the final code, delete all three marker lines, then `git add` the file to mark it as resolved and commit:

Terminal on your computer

```bash
$ tail -n 2 server.js
const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Listening on port ${port}`));
$ git add server.js
$ git commit --no-edit
[main f77f5c2] Merge branch 'port-from-env'
$ git log --oneline --graph
*   f77f5c2 Merge branch 'port-from-env'
|\
| * 9970398 Read the port from PORT
* | 9a2086f Log when the server starts
|/
* 3199366 Add package.json and .gitignore
* a754e78 Add the first server
$ git branch -d port-from-env
Deleted branch port-from-env (was 9970398).
```

The **merge commit** `f77f5c2` has two parents, which is where the graph joins again. `--no-edit` accepts Git's default message. The branch has done its job, so `git branch -d` deletes it; its commits stay in the history. If a merge gets confusing, `git merge --abort` puts everything back as it was before the merge.

## If you commit a secret

It happens: `.gitignore` was missing, or someone forced a file in. Here the mistake is made on purpose with `git add -f`, which adds a file even though it is ignored:

Terminal on your computer

```bash
$ git add -f .env
$ git commit -m "Add config"
[main 3947a0a] Add config
 1 file changed, 1 insertion(+)
 create mode 100644 .env
$ git show --stat --oneline HEAD
3947a0a Add config
 .env | 1 +
 1 file changed, 1 insertion(+)
```

What to do depends on one question: has the commit left your computer?

### Not pushed yet

Undo the commit. `git reset HEAD~1` moves the branch back one commit and keeps your files as they are, so `.env` is simply an ignored file again:

Terminal on your computer

```bash
$ git reset HEAD~1
$ git status --short --ignored
!! .env
!! node_modules/
$ git log --oneline -- .env
```

`!!` marks ignored files. `git log -- .env` lists the commits that touched `.env`, and now prints nothing: no commit on `main` contains it.

### Already pushed

Treat the secret as **stolen**. Bots scan public repositories for keys within minutes of a push. In this order:

1. **Rotate** the secret first: change the password, revoke the key, create a new one. This is the only step that really protects you.
2. Remove the file from Git and commit: `git rm --cached .env`, then add it to `.gitignore`. `--cached` stops tracking the file but keeps it on your disk.
3. The old value is still in the history. Rewriting history with a tool such as `git filter-repo`, and force-pushing, removes it from the repository, but copies that others already pulled or forked still have it. That is why step 1 comes first.

**GitHub secret scanning** helps. GitHub checks pushed code for the formats of known secrets (cloud keys, payment keys, tokens) and alerts you, and many providers revoke a leaked key automatically. **Push protection** goes further and blocks a push that contains a recognised secret before it is published. Both are on by default for public repositories; check *Settings → Code security* on yours.

Scanners work by matching patterns. This toy version shows the idea; the real ones know hundreds of formats:

scan.js

```ts
const patterns = [
  { name: "AWS access key id", regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "GitHub token", regex: /\bghp_[A-Za-z0-9]{36}\b/ },
  { name: "URL with a password", regex: /\/\/[^/\s:@]+:[^/\s@]+@/ },
];

function scan(fileName, text) {
  const found = [];
  text.split("\n").forEach((line, i) => {
    for (const p of patterns) {
      if (p.regex.test(line)) found.push(`${fileName}:${i + 1} looks like a ${p.name}`);
    }
  });
  return found;
}

const env = "PORT=3000\nDATABASE_URL=postgres://postgres:hunter2@db:5432/tasks";
console.log(scan(".env", env));
console.log(scan("config.js", 'const url = process.env.DATABASE_URL;'));
```

Output of `node scan.js` and of the browser terminal

```json
[ '.env:2 looks like a URL with a password' ]
[]
```

The `.env` text (with an obviously fake password) is flagged on line 2. The code that reads the value from `process.env` is clean, because it contains no secret at all. That is the pattern to follow.

## GitHub: remotes, push, pull

A **remote** is another copy of the repository, usually on GitHub, that you send commits to and get commits from. To publish the Task API:

1. Create an account on `github.com`, then click **New repository**. Name it `task-api`, make it **private** while you learn, and do not add a README (you have one).
2. GitHub shows the repository's URL. Connect your local repository to it:

Terminal on your computer

```bash
$ git remote add origin https://github.com/your-username/task-api.git
$ git remote -v
origin	https://github.com/your-username/task-api.git (fetch)
origin	https://github.com/your-username/task-api.git (push)
```

`origin` is the usual name for your main remote. Replace `your-username` with your GitHub name. Then:

- `git push -u origin main` sends your `main` branch and its commits to GitHub. `-u` remembers the link, so later a plain `git push` is enough. The first time, Git asks you to log in; GitHub accepts a browser login through Git Credential Manager, a personal access token, or an SSH key, never your account password.
- `git pull` fetches the commits others pushed and merges them into your branch. Pull before you start work each day.
- `git clone <url>` copies a whole repository from GitHub onto a new computer, with its full history. Then run `npm install`, because `node_modules` is not in the repository, and create your own `.env`.

### Pull requests

Teams do not push straight to `main`. They use **pull requests** (PRs), GitHub's way to propose, review and then merge a branch:

1. Create a branch and commit your work on it: `git switch -c done-filter`.
2. Push the branch: `git push -u origin done-filter`.
3. On GitHub, click **Compare & pull request**. Describe what changed and why.
4. Teammates read the diff and comment. Automated checks, such as your tests, run on it (the [next lesson](https://zudojs.oyinlola.site/learn/testing-basics) writes them). You fix things with more commits on the same branch; the PR updates by itself.
5. When it is approved and the checks pass, click **Merge**. GitHub creates the merge on `main`.
6. Locally, `git switch main`, `git pull`, and delete the old branch.

A conflict can happen in a PR too, when `main` changed the same lines. You resolve it exactly as above: merge `main` into your branch, fix the markers, commit and push.

## Practice

TRY IT YOURSELF

### A branch with a clean merge

In your `task-api` repository, create a branch `health`, add a new file `health.js`, commit it, switch back to `main` and merge. Why is there no conflict, and what does `git log --oneline --graph` show?

**Show a solution**

Run `git switch -c health`, create the file, `git add health.js`, `git commit -m "Add health check"`, `git switch main`, `git merge health`. There is no conflict because nobody else changed the same lines. If `main` got no new commits in the meantime, Git just moves `main` forward to your commit. That is a **fast-forward** merge, and the graph stays a straight line with no merge commit.

TRY IT YOURSELF

### What goes in .gitignore?

Which of these belong in `.gitignore` for a Node.js project: `node_modules/`, `package.json`, `package-lock.json`, `.env`, `.env.example`, `dist/` (compiled output), `*.log`, `src/`?

**Show a solution**

Ignore `node_modules/`, `.env`, `dist/` and `*.log`: they are generated, secret or local. Commit `package.json` and `package-lock.json` (they let anyone reinstall the exact same packages), `.env.example` (names only, no values) and of course `src/`.

TRY IT YOURSELF

### Extend the scanner

Add a pattern to `scan.js` for lines like `SECRET=...` or `API_KEY=...` with a value of 16 or more characters, and test it on a line with a long value and on `API_KEY=` with no value.

**Show a solution**

scan-env.js

```ts
const assignment = /^\s*[A-Z_]*(SECRET|KEY|TOKEN|PASSWORD)[A-Z_]*\s*=\s*\S{16,}/;

for (const line of ["API_KEY=0123456789abcdef0123", "API_KEY=", "PORT=3000"]) {
  console.log(JSON.stringify(line), assignment.test(line));
}
```

Output of `node scan-env.js` and of the browser terminal

```ts
"API_KEY=0123456789abcdef0123" true
"API_KEY=" false
"PORT=3000" false
```

An empty `API_KEY=`, as in a `.env.example` file, is not flagged, which is what you want.

## Recap

- Git records snapshots called commits: `git add` stages, `git commit -m` records, `git status` and `git log` show where you are.
- Branches hold separate lines of work. `git merge` joins them. A conflict shows both versions between markers: edit, `git add`, commit.
- Put `node_modules/` and `.env` in `.gitignore` before your first `git add .`. Read secrets from `process.env`.
- A committed secret that was pushed is leaked: rotate it first, then clean up. GitHub secret scanning and push protection help catch it.
- `git remote add origin`, `git push`, `git pull` and `git clone` connect you with GitHub. Teams merge through reviewed pull requests.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
