---
title: "Professional Git — ZudoJS Academy"
description: "Work like a professional team: issues, pull requests, code review, merge versus rebase, rebase conflicts, tags, releases, changelogs and open source."
source: https://zudojs.oyinlola.site/learn/git-collaboration
---

LEVEL 4 · LESSON 17 OF 21

Professional development Core

# Professional Git

Work like a professional team: issues, pull requests, code review, merge versus rebase, rebase conflicts, tags, releases, changelogs and open source.

- **55 min** to read and try
- **You need:** Git and GitHub, and The npm ecosystem in depth
- **You build:** A simulated team repository with a reviewed, rebased and squash-merged fix, a tagged release, a generated changelog, and a pull request from a fork

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Turn an issue into a small, well-described pull request with meaningful commits
- Choose between merge, rebase and squash, and rebase a branch safely with --force-with-lease
- Resolve a conflict during a rebase and read three-way conflict markers
- Give and receive code review that improves the code without hurting the people
- Tag a release, derive the next semantic version and a changelog from commit messages
- Contribute to an open-source project through a fork

## From "my code" to "our code"

In [Git and GitHub](https://zudojs.oyinlola.site/learn/git) you worked mostly alone: commits, a branch, one conflict, a push. Now picture the shop's backend three months later, with three developers:

- Someone pushed straight to `main` on Friday evening, and checkout was broken all weekend. Nobody else had looked at the change.
- A pull request has 40 commits called "fix", "fix again" and "wip". The reviewer gives up and clicks Approve.
- A customer reports a bug. Which version is running on the server? Was the fix in it? Nobody can say.
- Two branches changed the same function, and the developer who merged last "resolved" the conflict by deleting the other person's work.

None of these are Git problems. Git did exactly what it was told. They are **process** problems, and professional teams solve them with a small set of habits: every change goes through a reviewed pull request, history stays readable, conflicts are resolved with care, and every release is tagged with a version and a changelog. This lesson walks through all of them with real repositories on your computer.

```ts
 issue #12          branch                 pull request #13            main
 "SAVE10 not   -->  fix/save10-discount -> review + CI checks  -->  squash merge
  applied"          small commits           comments, fixes            |
                                                                      v
                                           CHANGELOG.md  <--  tag v1.1.0, release
```

The collaboration loop: every change starts as an issue and ends in a tagged release.

To make it real without a GitHub account, "GitHub" is played by a **bare repository**: a repository with no working files, only history, which is exactly what a server stores. Two clones of it are two developers, Ada and Bola. Every command and output below is from a real session; only the folder path is shortened to `~/team`.

Terminal on your computer

```bash
$ git init --bare github/shop-api.git
Initialized empty Git repository in ~/team/github/shop-api.git/
$ git clone github/shop-api.git ada
Cloning into 'ada'...
warning: You appear to have cloned an empty repository.
done.
$ cd ada
$ git add cart.js package.json
$ git commit -m "feat: add cart total"
[main (root-commit) 0522a2e] feat: add cart total
 2 files changed, 8 insertions(+)
 create mode 100644 cart.js
 create mode 100644 package.json
$ git tag -a v1.0.0 -m "First release"
$ git push origin main --follow-tags
To ~/team/github/shop-api.git
 * [new branch]      main -> main
 * [new tag]         v1.0.0 -> v1.0.0
$ cd ..
$ git clone github/shop-api.git bola
Cloning into 'bola'...
done.
$ cd bola
$ git config user.name "Bola Adeyemi"
$ git config user.email "bola@example.com"
```

`git config` without `--global` sets Bola's name for this one repository only. You will meet the tag `v1.0.0` again in the [releases](#releases) section.

## Issues: work starts with a problem statement

An **issue** is a tracked problem or request, with a number, a discussion, labels and an owner. GitHub, GitLab and every other forge have them. A good bug report saves hours, because the person fixing it can reproduce the problem without asking questions. Here is issue #12:

**SAVE10 discount is accepted but not applied**

**What happens:** At checkout, entering `SAVE10` shows "Code accepted", but the total stays ₦7,500.00.

**What should happen:** The total should be ₦6,750.00 (10% off).

**Steps:** Add 3 pairs of socks at ₦2,500. Enter `SAVE10`. Look at the total.

**Where:** production, version 1.0.0, since the discount feature launched.

What, expected, steps, where: four short parts. Labels such as `bug`, `good first issue` or `priority: high` help people find work, and many projects ship **issue templates** that ask for exactly these fields.

Issues also connect to code. A commit message or pull request description that says `Fixes #12` (or `Closes #12`, `Resolves #12`) makes GitHub close the issue automatically when the change reaches the main branch, and links the two forever. Finding those references is simple text processing:

closing-keywords.js

```ts
function closedIssues(text) {
  const pattern = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/gi;
  return [...text.matchAll(pattern)].map((match) => Number(match[1]));
}

const description = `Apply the SAVE10 discount in cartTotal.

Fixes #12. Also closes #9, which was the same bug reported from the mobile app.
Related to #15 (delivery fees), but does not fix it.`;

console.log(closedIssues(description));
```

Output of `node closing-keywords.js` and of the browser terminal

```json
[ 12, 9 ]
```

"Related to #15" links without closing. Choose the words deliberately: an issue closed by accident is an issue forgotten.

## A branch with meaningful commits

Bola takes issue #12. He creates a branch named after the work, fixes the function and commits:

Terminal on your computer

```bash
$ git switch -c fix/save10-discount
Switched to a new branch 'fix/save10-discount'
$ git diff
diff --git a/cart.js b/cart.js
index 26eeef5..6095b70 100644
--- a/cart.js
+++ b/cart.js
@@ -1,3 +1,4 @@
-export function cartTotal(items) {
-  return items.reduce((sum, item) => sum + item.priceKobo * item.qty, 0);
+export function cartTotal(items, discountCode) {
+  const subtotal = items.reduce((sum, item) => sum + item.priceKobo * item.qty, 0);
+  return discountCode === "SAVE10" ? Math.round(subtotal * 0.9) : subtotal;
 }
$ git commit -am "fix: apply SAVE10 discount to cart total" -m "The discount code was accepted at checkout but never applied." -m "Fixes #12"
[fix/save10-discount bb6b965] fix: apply SAVE10 discount to cart total
 1 file changed, 3 insertions(+), 2 deletions(-)
$ git push -u origin fix/save10-discount
To ~/team/github/shop-api.git
 * [new branch]      fix/save10-discount -> fix/save10-discount
branch 'fix/save10-discount' set up to track 'origin/fix/save10-discount'.
```

Each `-m` becomes a paragraph. The first is the **subject**, the rest the **body**. Good commit messages follow a few rules that make history useful months later:

- The subject says *what* the commit does, in the imperative ("apply", not "applied" or "applies"), in about 50 to 72 characters, with no full stop. Read it as "If applied, this commit will *apply SAVE10 discount to cart total*".
- The body says *why*. The diff already shows how.
- One logical change per commit. "Fix discount and rename variables and update README" is three commits.

The subject here also follows **Conventional Commits**, a widely used format: a type, an optional scope in brackets, a colon, and the description. The common types are `feat` (new feature), `fix` (bug fix), `docs`, `refactor`, `test` and `chore`. A `!` after the type, or a `BREAKING CHANGE:` line in the body, marks a change that breaks compatibility. The point of the format is that tools can read it, as you will see when you [compute a version number](#releases). A team usually checks messages automatically:

commit-lint.js

```ts
const TYPES = ["feat", "fix", "docs", "refactor", "test", "chore", "perf", "build", "ci"];

function lintSubject(subject) {
  const problems = [];
  const match = subject.match(/^(\w+)(\([\w-]+\))?(!)?: (.+)$/);
  if (!match) return ["not in the form type(scope): description"];
  const [, type, , , description] = match;
  if (!TYPES.includes(type)) problems.push(`unknown type "${type}"`);
  if (subject.length > 72) problems.push(`too long (${subject.length} > 72)`);
  if (description.endsWith(".")) problems.push("ends with a full stop");
  if (/^(added|fixed|updated|changed)\b/i.test(description)) problems.push("use the imperative: add, fix, update");
  return problems;
}

const subjects = [
  "fix: apply SAVE10 discount to cart total",
  "feat(delivery)!: charge delivery by weight instead of state",
  "fixed the discount bug.",
  "Fix: added discount",
  "wip",
];
for (const subject of subjects) {
  const problems = lintSubject(subject);
  console.log(problems.length ? "FAIL" : "PASS", JSON.stringify(subject), problems.join("; "));
}
```

Output of `node commit-lint.js` and of the browser terminal

```ts
PASS "fix: apply SAVE10 discount to cart total"
PASS "feat(delivery)!: charge delivery by weight instead of state"
FAIL "fixed the discount bug." not in the form type(scope): description
FAIL "Fix: added discount" unknown type "Fix"; use the imperative: add, fix, update
FAIL "wip" not in the form type(scope): description
```

Tools such as commitlint run this kind of check in a Git hook or in CI. The rules are only useful if they are automatic; nobody enforces them by hand for long.

## Merge or rebase?

While Bola worked, Ada's delivery-fee change was merged into `main`. Bola fetches and looks at the whole graph:

Terminal on your computer

```bash
$ git fetch
From ~/team/github/shop-api
   0522a2e..be838f2  main       -> origin/main
$ git log --oneline --graph --all
* be838f2 feat: add delivery fee by state
| * bb6b965 fix: apply SAVE10 discount to cart total
|/
* 0522a2e feat: add cart total
```

His branch no longer starts at the tip of `main`. Before the pull request is merged, the branch should include the latest `main`, so that CI tests the combination that will actually exist. There are two ways to get there. To compare them, the same branch was copied into a second folder, `bola-merge`, and each copy uses one way:

Terminal on your computer

```bash
$ cd bola-merge
$ git merge origin/main -m "Merge branch 'main' into fix/save10-discount"
Merge made by the 'ort' strategy.
 delivery.js | 3 +++
 1 file changed, 3 insertions(+)
 create mode 100644 delivery.js
$ git log --oneline --graph
*   e6b7328 Merge branch 'main' into fix/save10-discount
|\
| * be838f2 feat: add delivery fee by state
* | bb6b965 fix: apply SAVE10 discount to cart total
|/
* 0522a2e feat: add cart total
$ cd ../bola
$ git rebase origin/main
Successfully rebased and updated refs/heads/fix/save10-discount.
$ git log --oneline --graph
* 586f4ea fix: apply SAVE10 discount to cart total
* be838f2 feat: add delivery fee by state
* 0522a2e feat: add cart total
```

- **Merge** adds a new commit with two parents that joins the lines. Nothing existing changes. History shows exactly what happened, including the fork in the road.
- **Rebase** takes your commits and replays them, one by one, on top of the new base, as if you had started your work today. History becomes a straight line. But look at the hash: `bb6b965` became `586f4ea`. A rebased commit is a *new* commit with the same change; the old one is abandoned.

Because the rebase replaced commits that were already on the server, a normal push is refused:

Terminal on your computer

```bash
$ git push
To ~/team/github/shop-api.git
 ! [rejected]        fix/save10-discount -> fix/save10-discount (non-fast-forward)
error: failed to push some refs to '~/team/github/shop-api.git'
hint: Updates were rejected because the tip of your current branch is behind
hint: its remote counterpart. If you want to integrate the remote changes,
hint: use 'git pull' before pushing again.
hint: See the 'Note about fast-forwards' in 'git push --help' for details.
$ git push --force-with-lease
To ~/team/github/shop-api.git
 + bb6b965...586f4ea fix/save10-discount -> fix/save10-discount (forced update)
```

Ignore the hint here. `git pull` would merge the *old* commits back into the rebased ones and give you both copies. After a rebase you **mean** to replace the remote branch, so you force the push, and you use `--force-with-lease`, never plain `--force`. You will see why in a moment.

REASON IT OUT

### Merge or rebase this branch?

Decide for each situation, and say what could go wrong with the other choice:

1. Your own feature branch, pushed only so that the pull request exists, is 5 commits behind `main`.
2. `main` itself is behind the server (a teammate merged a pull request).
3. A long-running `release/2.0` branch that four people commit to needs the latest fixes from `main`.
4. Your branch has 12 commits: 3 real steps and 9 called "fix typo" or "wip".

**Show the reasoning**

1. **Rebase** (or merge, if your team prefers). It is your branch; replacing its commits only affects you, and the history reads cleanly.
2. **Neither by hand: pull.** `git pull` fast-forwards `main` when you have no local commits on it, which you should not. Never rebase `main` itself.
3. **Merge.** This is the golden rule of rebasing: *never rebase commits other people have based work on.* Rebasing a shared branch gives everyone else's copy a history that no longer exists on the server, and their next pull duplicates or loses work.
4. Clean it up before review: `git rebase -i origin/main` lets you squash the "wip" commits into the real ones and reword messages. Or let the pull request be **squash-merged** (below), which turns the whole branch into one commit on `main`.

## A conflict during a rebase

Meanwhile, Ada refactors the cart on `main`, changing the very line Bola's fix also changed. Before fetching, Bola switches on a more informative conflict style, `zdiff3`, which also shows what the lines looked like *before* either side changed them:

Terminal on your computer

```bash
$ git config merge.conflictStyle zdiff3
$ git fetch
From ~/team/github/shop-api
   be838f2..a7f6522  main       -> origin/main
$ git rebase origin/main
Auto-merging cart.js
CONFLICT (content): Merge conflict in cart.js
error: could not apply 586f4ea... fix: apply SAVE10 discount to cart total
hint: Resolve all conflicts manually, mark them as resolved with
hint: "git add/rm <conflicted_files>", then run "git rebase --continue".
hint: You can instead skip this commit: run "git rebase --skip".
hint: To abort and get back to the state before "git rebase", run "git rebase --abort".
hint: Disable this message with "git config set advice.mergeConflict false"
Could not apply 586f4ea... # fix: apply SAVE10 discount to cart total
$ cat cart.js
<<<<<<< HEAD
const lineTotal = (item) => item.priceKobo * item.qty;

export function cartTotal(items) {
  return items.reduce((sum, item) => sum + lineTotal(item), 0);
||||||| parent of 586f4ea (fix: apply SAVE10 discount to cart total)
export function cartTotal(items) {
  return items.reduce((sum, item) => sum + item.priceKobo * item.qty, 0);
=======
export function cartTotal(items, discountCode) {
  const subtotal = items.reduce((sum, item) => sum + item.priceKobo * item.qty, 0);
  return discountCode === "SAVE10" ? Math.round(subtotal * 0.9) : subtotal;
>>>>>>> 586f4ea (fix: apply SAVE10 discount to cart total)
}
```

Three versions of the same lines, and the middle one is the key:

- Between `<<<<<<< HEAD` and `|||||||`: the new base, Ada's refactor on `main`.
- Between `|||||||` and `=======`: the **original** lines both sides started from.
- Between `=======` and `>>>>>>>`: Bola's commit being replayed.

Comparing each side with the original shows what each person *meant*: Ada extracted `lineTotal`; Bola added a `discountCode` parameter and a `subtotal`. A correct resolution keeps **both intentions**, not one side's text. Deleting Ada's side because "mine is newer" is exactly how work gets lost in the opening story.

> OURS AND THEIRS ARE SWAPPED IN A REBASE
>
> During a merge, `HEAD` ("ours") is your branch. During a rebase, Git is replaying your commits onto `main`, so `HEAD` is *main* and your own commit is "theirs". Commands like `git checkout --ours cart.js` therefore pick the opposite side from what you would expect. Read the labels on the markers instead of trusting the words.

A conflict marker is just text, so a program can pull the three versions apart. This one parses the real conflict above:

conflict-parts.js

```ts
const file = `<<<<<<< HEAD
const lineTotal = (item) => item.priceKobo * item.qty;

export function cartTotal(items) {
  return items.reduce((sum, item) => sum + lineTotal(item), 0);
||||||| parent of 586f4ea (fix: apply SAVE10 discount to cart total)
export function cartTotal(items) {
  return items.reduce((sum, item) => sum + item.priceKobo * item.qty, 0);
=======
export function cartTotal(items, discountCode) {
  const subtotal = items.reduce((sum, item) => sum + item.priceKobo * item.qty, 0);
  return discountCode === "SAVE10" ? Math.round(subtotal * 0.9) : subtotal;
>>>>>>> 586f4ea (fix: apply SAVE10 discount to cart total)
}`;

function parseConflict(text) {
  const parts = { head: [], base: [], incoming: [] };
  let section = null;
  for (const line of text.split("\n")) {
    if (line.startsWith("<<<<<<< ")) section = "head";
    else if (line.startsWith("||||||| ")) section = "base";
    else if (line === "=======") section = "incoming";
    else if (line.startsWith(">>>>>>> ")) section = null;
    else if (section) parts[section].push(line);
  }
  return parts;
}

const { head, base, incoming } = parseConflict(file);
const added = (side) => side.filter((line) => !base.includes(line));
console.log("main added:  ", added(head));
console.log("branch added:", added(incoming));
```

Output of `node conflict-parts.js` and of the browser terminal

```ts
main added:   [
  'const lineTotal = (item) => item.priceKobo * item.qty;',
  '',
  '  return items.reduce((sum, item) => sum + lineTotal(item), 0);'
]
branch added: [
  'export function cartTotal(items, discountCode) {',
  '  const subtotal = items.reduce((sum, item) => sum + item.priceKobo * item.qty, 0);',
  '  return discountCode === "SAVE10" ? Math.round(subtotal * 0.9) : subtotal;'
]
```

Seen this way, the resolution is clear: keep `lineTotal`, add the parameter and the discount line, and use `lineTotal` inside the new `reduce`. Bola writes that, **runs the code** before continuing, and finishes the rebase:

Terminal on your computer

```bash
$ node -e "import('./cart.js').then(({ cartTotal }) => console.log(cartTotal([{ priceKobo: 250000, qty: 3 }], 'SAVE10')))"
675000
$ git add cart.js
$ GIT_EDITOR=true git rebase --continue
[detached HEAD f53e6e8] fix: apply SAVE10 discount to cart total
 1 file changed, 3 insertions(+), 2 deletions(-)
Successfully rebased and updated refs/heads/fix/save10-discount.
$ git log --oneline --graph
* f53e6e8 fix: apply SAVE10 discount to cart total
* a7f6522 refactor: extract lineTotal
* be838f2 feat: add delivery fee by state
* 0522a2e feat: add cart total
$ git push --force-with-lease
To ~/team/github/shop-api.git
 + 586f4ea...f53e6e8 fix/save10-discount -> fix/save10-discount (forced update)
```

₦2,500 × 3 = ₦7,500, minus 10% is ₦6,750: 675,000 kobo, the value the issue asked for. `GIT_EDITOR=true` only skips the editor that would open to confirm the commit message; normally you just save and close it. A rebase with several commits can stop at each one that conflicts; you resolve, `git add` and `git rebase --continue` each time, or `git rebase --abort` to go back to where you started.

### Why --force-with-lease

Pull requests are often shared. Ada, reviewing, adds a test directly to Bola's branch and pushes it. Bola has not fetched since. He rewords his own commit (which rewrites it) and tries to force-push:

Terminal on your computer

```bash
$ git commit --amend -m "fix: apply the SAVE10 discount in cartTotal" -m "The discount code was accepted at checkout but never applied." -m "Fixes #12"
[fix/save10-discount 5f76cb9] fix: apply the SAVE10 discount in cartTotal
 Date: Tue Sep 22 10:15:00 2026 +0100
 1 file changed, 3 insertions(+), 2 deletions(-)
$ git push --force-with-lease
To ~/team/github/shop-api.git
 ! [rejected]        fix/save10-discount -> fix/save10-discount (stale info)
error: failed to push some refs to '~/team/github/shop-api.git'
```

`--force-with-lease` means "overwrite the remote branch *only if* it is still where I last saw it". It was not: Ada's test commit had arrived. Plain `--force` would have silently deleted her commit from the server. Bola fetches and rebases onto the remote branch instead:

Terminal on your computer

```bash
$ git pull --rebase
From ~/team/github/shop-api
   f53e6e8..010d118  fix/save10-discount -> origin/fix/save10-discount
warning: skipped previously applied commit 5f76cb9
hint: use --reapply-cherry-picks to include skipped commits
hint: Disable this message with "git config set advice.skippedCherryPicks false"
Successfully rebased and updated refs/heads/fix/save10-discount.
$ git log --oneline -3
010d118 test: cover the SAVE10 discount
f53e6e8 fix: apply SAVE10 discount to cart total
a7f6522 refactor: extract lineTotal
```

Ada's test is safe. Notice one surprise: Git saw that Bola's amended commit makes exactly the same change as a commit already on the remote branch (only the message differed), so it skipped it, and the new message was lost. Rewriting commits on a branch that others also push to keeps producing surprises like this. Agree who owns a branch, and once others work on it, add commits instead of rewriting.

> TIP
>
> Some editors run `git fetch` in the background, which updates your view of the remote without you looking at it, and then `--force-with-lease` can no longer protect you. Adding `--force-if-includes` closes that gap: it also checks that your branch contains what you fetched.

## Pull requests that get reviewed well

A **pull request** (GitLab calls it a **merge request**) asks the team to merge a branch. On GitHub, pushing a branch shows a **Compare & pull request** button. What makes a PR easy to review:

- **A clear title**, often the same as the main commit subject.
- **A description** that answers: what changed, why, how to test it, and what the reviewer should look at closely. Link the issue with `Fixes #12`. Add screenshots for visual changes. Many repositories have a `.github/pull_request_template.md` that pre-fills these headings.
- **Small size.** Review quality drops sharply as PRs grow. A few hundred changed lines is a good upper bound; split bigger work into a series of PRs.
- **Draft PRs** for work in progress, so people can comment early without anyone merging by accident.

Size is easy to measure. `git diff --numstat` prints added and removed lines per file. The first four lines below are the real output between the two releases of the shop; the last line shows what a dependency update would add. The check leaves lockfiles out, since nobody reviews those line by line:

pr-size.js

```ts
const numstat = `5\t2\tcart.js
7\t0\tcart.test.js
3\t0\tdelivery.js
1\t1\tpackage.json
2204\t1890\tpackage-lock.json`;

const IGNORED = new Set(["package-lock.json", "pnpm-lock.yaml", "yarn.lock"]);
const LIMIT = 400;

let changed = 0;
for (const line of numstat.split("\n")) {
  const [added, removed, file] = line.split("\t");
  if (IGNORED.has(file)) continue;
  changed += Number(added) + Number(removed);
}
console.log(`${changed} lines changed (lockfiles ignored):`, changed > LIMIT ? "consider splitting this PR" : "reviewable");
```

Output of `node pr-size.js` and of the browser terminal

```ts
19 lines changed (lockfiles ignored): reviewable
```

### What happens on GitHub

Once the PR is open, a typical protected repository requires, before the **Merge** button turns green:

- **Status checks**: CI runs `npm run check` (lint, format and tests in one script, which [JavaScript tooling](https://zudojs.oyinlola.site/learn/js-tooling#scripts), the next module, sets up) on the PR branch merged with `main`.
- **Approving reviews**, often one or two. A `CODEOWNERS` file can require a review from specific people for specific paths, such as the payments team for `src/payments/`.
- **An up-to-date branch**, so the tested combination is the one that gets merged.

These rules are set under *Settings → Branches* (branch protection rules or rulesets). They are what makes "someone pushed to main on Friday" impossible. `CODEOWNERS` lines are a path pattern followed by owners, and the *last* matching line wins:

codeowners.js

```ts
const codeowners = `
*                 @naija-shop/backend
src/payments/**   @naija-shop/payments
*.md              @naija-shop/docs
src/payments/README.md  @ada
`;

function toRegex(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const body = escaped.replace(/\*\*/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\u0000/g, ".*");
  return new RegExp(pattern.includes("/") ? `^${body}$` : `(^|/)${body}$`);
}

const rules = codeowners.trim().split("\n").map((line) => {
  const [pattern, ...owners] = line.trim().split(/\s+/);
  return { regex: toRegex(pattern), owners };
});

function ownersOf(file) {
  return rules.filter((rule) => rule.regex.test(file)).at(-1)?.owners ?? [];
}

for (const file of ["src/cart.js", "src/payments/paystack.js", "docs/setup.md", "src/payments/README.md"]) {
  console.log(file.padEnd(26), ownersOf(file).join(" "));
}
```

Output of `node codeowners.js` and of the browser terminal

```ts
src/cart.js                @naija-shop/backend
src/payments/paystack.js   @naija-shop/payments
docs/setup.md              @naija-shop/docs
src/payments/README.md     @ada
```

### Merging: three buttons

| GitHub option | What lands on `main` | Good for |
| --- | --- | --- |
| Create a merge commit | All branch commits plus a merge commit | Keeping every step; long-lived branches |
| Squash and merge | One new commit containing the whole PR | Most feature PRs: one PR, one commit, easy to revert |
| Rebase and merge | The branch commits, replayed on top, no merge commit | PRs whose commits are each clean and meaningful |

Ada squash-merges the PR. Locally, the same thing looks like this:

Terminal on your computer

```bash
$ git switch main
Switched to branch 'main'
Your branch is up to date with 'origin/main'.
$ git merge --squash fix/save10-discount
Updating a7f6522..010d118
Fast-forward
Squash commit -- not updating HEAD
 cart.js      | 5 +++--
 cart.test.js | 7 +++++++
 2 files changed, 10 insertions(+), 2 deletions(-)
 create mode 100644 cart.test.js
$ git commit -m "fix: apply SAVE10 discount to cart total (#13)" -m "Fixes #12"
[main c14579f] fix: apply SAVE10 discount to cart total (#13)
 2 files changed, 10 insertions(+), 2 deletions(-)
 create mode 100644 cart.test.js
$ git push
To ~/team/github/shop-api.git
   a7f6522..c14579f  main -> main
$ git push origin --delete fix/save10-discount
To ~/team/github/shop-api.git
 - [deleted]         fix/save10-discount
$ git branch -D fix/save10-discount
Deleted branch fix/save10-discount (was 010d118).
```

GitHub adds the PR number to the subject, as done by hand here. Two details: the branch had to be deleted with `-D` (force), because a squash creates a *new* commit, so Git cannot see that the branch's own commits were merged. And on GitHub the squashed commit is credited to the PR's author, with co-authors listed; in this local simulation Ada, who ran the commands, is the author.

## Code review: giving and receiving

Code review has two goals: catch problems before users do, and spread knowledge so that more than one person understands every part of the system. It works when reviewers are thorough and kind, and authors are open and responsive.

### What to look for, in order

1. **Does it do what the issue asked, and nothing it should not?** Read the description, then the tests, then the code.
2. **Correctness and edge cases.** Empty cart, lower-case `save10`, a discount plus a delivery fee, rounding of kobo. Ask the questions from this course's reasoning blocks.
3. **Tests** that would fail without the change.
4. **Security and data.** Input validation, secrets in code or logs, permissions checks, SQL built from strings.
5. **Design and names** that the next developer will understand.
6. Style last, and only what the formatter and linter do not already enforce.

### How to write comments

Compare two comments on Bola's PR:

This is wrong.

**question (blocking):** What happens when a customer types `save10` in lower case? The issue's screenshot shows the input is not upper-cased in the form. Could we normalise the code here, and add a test for it?

The second says what, why, and what would fix it, and it marks how important it is. A common convention, **Conventional Comments**, starts each comment with a label: `praise:`, `question:`, `suggestion:`, `issue:`, `nit:` (a tiny point the author may ignore), plus `(blocking)` or `(non-blocking)`. Comment on the code, never on the person ("this function" rather than "you"), and say what is good too. GitHub's **suggestion** blocks let you propose an exact replacement the author can apply with one click.

Labels also make the outcome mechanical. If any comment is blocking, the review is "request changes"; otherwise it is "approve", with the remaining comments as optional improvements:

review-outcome.js

```ts
const comments = [
  "praise: the test names read like the issue, very clear",
  "question (blocking): what happens with a lower-case save10?",
  "nit: `subtotal` could be `subtotalKobo` to match priceKobo",
  "suggestion (non-blocking): extract the discount rules into discounts.js later",
];

function outcome(comments) {
  const parsed = comments.map((text) => {
    const [, label, decoration] = text.match(/^(\w+)(?: \(([\w-]+)\))?:/) ?? [];
    const blocking = decoration === "blocking" || (decoration === undefined && label === "issue");
    return { label, blocking };
  });
  const blocking = parsed.filter((c) => c.blocking).length;
  return { decision: blocking > 0 ? "request changes" : "approve", blocking, optional: parsed.length - blocking };
}

console.log(outcome(comments));
console.log(outcome(comments.filter((c) => !c.includes("(blocking)"))));
```

Output of `node review-outcome.js` and of the browser terminal

```json
{ decision: 'request changes', blocking: 1, optional: 3 }
{ decision: 'approve', blocking: 0, optional: 3 }
```

### Receiving a review

- The review is about the code, not about you. Every senior developer's PRs get comments.
- Answer every comment: fix it and say so ("Done in 010d118"), or explain why not. Disagree with reasons, and if a thread goes back and forth more than twice, talk in person or on a call.
- Push fixes as new commits during review, so reviewers see only what changed since they last looked. Clean up (or squash-merge) at the end.
- Do not merge your own PR past an unresolved blocking comment.

As a reviewer, respond quickly (within a working day), because a waiting PR blocks its author and goes stale. A review is a conversation, not an exam.

## Tags, versions, releases and changelogs

A **tag** is a permanent name for one commit: `v1.0.0` means "this exact code was version 1.0.0". Branches move; tags do not. An **annotated** tag (`git tag -a`) is a real object with a message, an author and a date, and is what releases should use; a **lightweight** tag (`git tag v1.0.0` without `-a`) is just a name.

Which version comes next? Semantic versioning (from [The npm ecosystem in depth](https://zudojs.oyinlola.site/learn/npm-ecosystem#semver)) says: a breaking change bumps MAJOR, a new feature MINOR, a fix PATCH. With Conventional Commits, the answer can be computed from the commit subjects since the last tag:

Terminal on your computer

```bash
$ git log --oneline v1.0.0..HEAD
c14579f fix: apply SAVE10 discount to cart total (#13)
a7f6522 refactor: extract lineTotal
be838f2 feat: add delivery fee by state
```

next-version.js

```ts
function bumpFor(subjects) {
  let bump = null;
  for (const subject of subjects) {
    const [, type, breaking] = subject.match(/^(\w+)(?:\([\w-]+\))?(!)?:/) ?? [];
    if (breaking || subject.includes("BREAKING CHANGE")) return "major";
    if (type === "feat") bump = "minor";
    else if (type === "fix" && bump === null) bump = "patch";
  }
  return bump;
}

function nextVersion(current, bump) {
  const [major, minor, patch] = current.split(".").map(Number);
  if (bump === "major") return `${major + 1}.0.0`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  if (bump === "patch") return `${major}.${minor}.${patch + 1}`;
  return current;
}

const sinceV1 = [
  "fix: apply SAVE10 discount to cart total (#13)",
  "refactor: extract lineTotal",
  "feat: add delivery fee by state",
];
console.log(bumpFor(sinceV1), "->", nextVersion("1.0.0", bumpFor(sinceV1)));
console.log(bumpFor(["docs: add README", "test: cover rounding"]), "->", nextVersion("1.1.0", bumpFor(["docs: add README"])));
console.log(bumpFor(["feat(delivery)!: charge by weight"]), "->", nextVersion("1.1.0", "major"));
```

Output of `node next-version.js` and of the browser terminal

```ts
minor -> 1.1.0
null -> 1.1.0
major -> 2.0.0
```

A feature and a fix mean a minor release: 1.1.0. Documentation and tests alone need no release. `npm version` (from the npm lesson) does the rest in a Git repository: it updates `package.json`, commits, and creates an annotated tag. Push the tag with the commit using `--follow-tags`:

Terminal on your computer

```bash
$ npm version minor -m "chore(release): %s"
v1.1.0
$ git log --oneline -2
b929cb6 chore(release): 1.1.0
c14579f fix: apply SAVE10 discount to cart total (#13)
$ git tag -n
v1.0.0          First release
v1.1.0          chore(release): 1.1.0
$ git show v1.1.0 --no-patch
tag v1.1.0
Tagger: Ada Lovelace <ada@example.com>
Date:   Wed Sep 23 16:00:00 2026 +0100

chore(release): 1.1.0

commit b929cb60559365600aea8eb75749546b32189fcb
Author: Ada Lovelace <ada@example.com>
Date:   Wed Sep 23 16:00:00 2026 +0100

    chore(release): 1.1.0
$ git push --follow-tags
To ~/team/github/shop-api.git
   c14579f..b929cb6  main -> main
 * [new tag]         v1.1.0 -> v1.1.0
```

Now the question "which version is on the server?" has an answer. `git describe` names any commit relative to the nearest tag. After one more commit:

Terminal on your computer

```bash
$ git commit -m "docs: add README"
[main cf3c847] docs: add README
 1 file changed, 1 insertion(+)
 create mode 100644 README.md
$ git describe
v1.1.0-1-gcf3c847
```

"1 commit after v1.1.0, at commit `cf3c847`" (the `g` stands for Git). Build scripts often embed this string in the application so that a health endpoint or the logs can report the exact code that is running.

### Changelogs

A **changelog** is the human-readable list of changes per version, written for the people who *use* your code, not for its developers. The widely used "Keep a Changelog" format groups changes under headings such as Added, Changed, Fixed and Removed, newest version first. With conventional commits, a first draft can be generated:

changelog.js

```ts
const releases = [
  {
    version: "1.1.0",
    date: "2026-09-23",
    subjects: [
      "fix: apply SAVE10 discount to cart total (#13)",
      "refactor: extract lineTotal",
      "feat: add delivery fee by state",
    ],
  },
  { version: "1.0.0", date: "2026-09-21", subjects: ["feat: add cart total"] },
];

const SECTIONS = { feat: "Added", fix: "Fixed" };

function changelog(releases) {
  const lines = ["# Changelog", ""];
  for (const { version, date, subjects } of releases) {
    lines.push(`## [${version}] - ${date}`);
    for (const [type, heading] of Object.entries(SECTIONS)) {
      const entries = subjects.filter((s) => s.startsWith(`${type}:`) || s.startsWith(`${type}(`));
      if (entries.length === 0) continue;
      lines.push("", `### ${heading}`, ...entries.map((s) => `- ${s.slice(s.indexOf(":") + 2)}`));
    }
    lines.push("");
  }
  return lines.join("\n");
}

console.log(changelog(releases));
```

Output of `node changelog.js` and of the browser terminal

```ts
# Changelog

## [1.1.0] - 2026-09-23

### Added
- add delivery fee by state

### Fixed
- apply SAVE10 discount to cart total (#13)

## [1.0.0] - 2026-09-21

### Added
- add cart total
```

The refactor is left out: users do not care how the code is arranged, only what changed for them. Treat generated text as a draft and edit it for readers ("SAVE10 discount codes now reduce the total" beats a commit subject). Tools such as Changesets, release-please and semantic-release automate the whole chain (version, tag, changelog, npm publish) from commits or small change files; the ZudoJS packages are released with Changesets.

On GitHub, a **release** is a page attached to a tag, with notes (usually the changelog section) and optional files to download. You create it under *Releases → Draft a new release* or from CI, and people can subscribe to new releases of a repository.

## Contributing to open source

Everything above works inside one team. Open-source projects add one step, because you cannot push branches to someone else's repository: you work in a **fork**, your own copy of the project on GitHub, and open a pull request from the fork to the original, which is called **upstream**. Here `naija-shop/invoice-kit` is the project and `ada/invoice-kit` is Ada's fork (made on GitHub with the **Fork** button; simulated by folders again):

Terminal on your computer

```bash
$ git clone github/ada/invoice-kit.git invoice-kit
Cloning into 'invoice-kit'...
done.
$ cd invoice-kit
$ git remote add upstream ../github/naija-shop/invoice-kit.git
$ git remote -v
origin	~/oss/github/ada/invoice-kit.git (fetch)
origin	~/oss/github/ada/invoice-kit.git (push)
upstream	../github/naija-shop/invoice-kit.git (fetch)
upstream	../github/naija-shop/invoice-kit.git (push)
$ git fetch upstream
From ../github/naija-shop/invoice-kit
 * [new branch]      main       -> upstream/main
$ git switch -c docs/vat-example upstream/main
Switched to a new branch 'docs/vat-example'
branch 'docs/vat-example' set up to track 'upstream/main'.
$ git commit -am "docs: explain VAT_RATE in the README"
[docs/vat-example cf4950c] docs: explain VAT_RATE in the README
 1 file changed, 2 insertions(+)
$ git push -u origin docs/vat-example
To ~/oss/github/ada/invoice-kit.git
 * [new branch]      docs/vat-example -> docs/vat-example
branch 'docs/vat-example' set up to track 'origin/docs/vat-example'.
```

- `origin` is your fork (you can push); `upstream` is the project (you can only read). On GitHub both would be URLs such as `https://github.com/naija-shop/invoice-kit.git`.
- The fork was made before upstream added a VAT feature, so the branch starts from `upstream/main`, not from the fork's out-of-date `main`. Always base new work on the latest upstream.
- After the push, GitHub offers to open a pull request from `ada:docs/vat-example` into `naija-shop:main`.

### Being a good contributor

- **Read `CONTRIBUTING.md` first.** It says how the project wants issues, branches, commit messages and tests. Also read the code of conduct.
- **Start small.** Documentation fixes and issues labelled `good first issue` or `help wanted` are meant for newcomers.
- **Ask before big changes.** Open or comment on an issue describing your plan. A large unrequested PR is often closed, however good, because maintainers must support the code for years.
- **Keep the PR focused**, follow the project's style, include tests, and run its checks locally.
- **Be patient.** Maintainers are often volunteers. A polite reminder after a week or two is fine.
- Some projects ask you to sign a **CLA** (contributor licence agreement) or to add a `Signed-off-by` line to commits (`git commit -s`, the Developer Certificate of Origin). These state that you have the right to contribute the code.

## Failure cases and production concerns

- **Force-pushing a shared branch** with plain `--force` deletes other people's commits from the server. Use `--force-with-lease` (plus `--force-if-includes`), and never force-push `main`; protect it on GitHub so nobody can.
- **Rebasing public history.** Only rebase commits that nobody else has built on.
- **Resolving conflicts by picking a side** without understanding both. Use `zdiff3`, compare each side with the base, and run the tests before continuing.
- **Lockfile conflicts.** Do not hand-merge `package-lock.json`: resolve `package.json`, then run `npm install` (see [The npm ecosystem in depth](https://zudojs.oyinlola.site/learn/npm-ecosystem#lockfile)).
- **Giant PRs** get rubber-stamped. Split them.
- **Moving a tag.** Once a tag is pushed, others may have built or deployed from it. If a release is broken, release a new version; do not delete and recreate the tag.
- **Secrets in a PR.** A pushed branch is on the server even if the PR is closed. Treat it as leaked and rotate it, as in [Git and GitHub](https://zudojs.oyinlola.site/learn/git#secrets).

Testing is part of the loop: CI runs the full check on every PR, and branch protection makes a red check block the merge. The combination of review and automated checks is what lets a team deploy `main` at any time with confidence.

## Practice

TRY IT YOURSELF

### Practise a rebase conflict yourself

Create a bare repository and two clones in a temporary folder, as at the start of this lesson. In clone A, change line 1 of a file on `main` and push. In clone B, create a branch from the old `main`, change the same line differently, commit, then `git rebase origin/main` after fetching. Resolve the conflict keeping both changes, and finish the rebase. Then undo it all with `git reflog`: find the entry from before the rebase and `git reset --hard` to it.

Work it out first, on paper or in your head. Then use the hints, and compare with the solution.

HINT 1

Follow the exact shape of the walkthrough above: `git init --bare`, two `git clone`s, a commit and push in one clone, a branch and a conflicting commit in the other, then `git fetch` and `git rebase origin/main`.

HINT 2

`git reflog` shows every position `HEAD` has been at, even ones no branch points to any more. Find the line for right before you ran `git rebase`, and pass that entry (such as `HEAD@{3}`) to `git reset --hard`.

SOLUTION

The commands follow the sessions above: `git init --bare origin.git`, `git clone origin.git a`, `git clone origin.git b`; commit and push in `a`; `git switch -c change`, commit, `git fetch`, `git rebase origin/main` in `b`. After resolving: `git add`, `git rebase --continue`.

`git reflog` lists every position `HEAD` has had, including commits that no branch points to any more, such as your branch's commits from before the rebase. Entries look like `586f4ea HEAD@{3}: commit: …`. `git reset --hard HEAD@{3}` (or the hash) moves the branch back. This is why a rebase is not as dangerous as it looks: for about 90 days, abandoned commits can still be recovered from the reflog.

TRY IT YOURSELF

### Next version with a patch-only release

Extend `next-version.js` so that `bumpFor` also treats `perf:` as a patch, and returns `null` when nothing needs a release. Test it on `["perf: cache delivery fees", "docs: fix typo"]` from version `1.1.0`.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

`PATCH_TYPES.has(type)` replaces checking each patch-level type by name one at a time, the same way `CRITICAL.has(label)` did in the worked example.

HINT 2

`if (breaking || subject.includes("BREAKING CHANGE")) return "major"; if (type === "feat") bump = "minor"; else if (PATCH_TYPES.has(type) && bump === null) bump = "patch";`

SOLUTION

next-version-perf.js

```ts
const PATCH_TYPES = new Set(["fix", "perf"]);

function bumpFor(subjects) {
  let bump = null;
  for (const subject of subjects) {
    const [, type, breaking] = subject.match(/^(\w+)(?:\([\w-]+\))?(!)?:/) ?? [];
    if (breaking || subject.includes("BREAKING CHANGE")) return "major";
    if (type === "feat") bump = "minor";
    else if (PATCH_TYPES.has(type) && bump === null) bump = "patch";
  }
  return bump;
}

function nextVersion(current, bump) {
  const [major, minor, patch] = current.split(".").map(Number);
  return { major: `${major + 1}.0.0`, minor: `${major}.${minor + 1}.0`, patch: `${major}.${minor}.${patch + 1}` }[bump] ?? current;
}

console.log(nextVersion("1.1.0", bumpFor(["perf: cache delivery fees", "docs: fix typo"])));
console.log(bumpFor(["docs: fix typo", "chore: update dev tools"]));
```

Output of `node next-version-perf.js` and of the browser terminal

```ts
1.1.1
null
```

A lookup object replaces the chain of `if`s, and `?? current` handles `null`. Which types trigger a release is a team decision; writing it as data (`PATCH_TYPES`) makes it easy to change.

TRY IT YOURSELF

### Review this pull request

A PR titled "update" changes 1,200 lines across 30 files, has no description, and contains the line `const API_KEY = "sk_live_...";` in `src/payments/client.js`. Write the review you would leave: which comments, which labels, and what outcome.

Work it out first, on paper or in your head. Then use the hints, and compare with the solution.

HINT 1

Re-read [What to look for, in order](#review) and the Conventional Comments labels in [Code review](#review). One of the three problems here is far more urgent than the other two — which, and why?

HINT 2

A live secret in a diff is not just a style note: once pushed, treat it as already leaked ([Git and GitHub](#secrets)'s rule applies here too). Size and a missing description are real blockers as well, but they can wait a few minutes for the fix that cannot.

SOLUTION

**issue (blocking):** `src/payments/client.js` contains a live secret key. Please remove it and read it from `process.env` instead. Because it has been pushed, the key must be treated as leaked: please ask the payments owner to rotate it today.

**issue (blocking):** Could you add a description (what, why, how to test) and link the issue? At 1,200 lines across 30 files I cannot review this safely. Could it be split, for example the refactor first and the new behaviour second?

**suggestion (non-blocking):** A title like `feat(payments): add refunds` would tell us what this is at a glance.

Outcome: **request changes**. The secret comes first because it is urgent and outlives the PR. The tone stays about the code and offers a way forward, so the author knows exactly what to do next.

## Recap

- Work flows issue → branch → small, well-described commits → pull request → review and CI → merge → tag → release notes. `Fixes #12` links and closes issues.
- Merge preserves history with a merge commit; rebase replays commits as new ones for a straight line. Rebase only your own unshared commits, and push rebased branches with `--force-with-lease`.
- In a conflict, compare each side with the base (`zdiff3`), keep both intentions, run the code, then continue. In a rebase, "ours" and "theirs" are swapped.
- Protected branches require checks and reviews. Squash-merge makes one PR one commit.
- Review for correctness, tests and security before style; label comments and mark what blocks. Receive reviews as help, and answer every comment.
- Annotated tags mark releases; Conventional Commits let tools compute the next semantic version and draft a changelog; `git describe` identifies running code.
- Open source: fork, add `upstream`, branch from `upstream/main`, follow `CONTRIBUTING.md`, start small.

Next: [JavaScript tooling](https://zudojs.oyinlola.site/learn/js-tooling), the formatters, linters, bundlers and check scripts that the CI checks on your pull requests run.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
