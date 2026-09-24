---
title: "Your developer environment"
description: "Meet the tools a developer uses every day, the terminal, a code editor and the browser's developer tools, and learn to move around your files by typing commands."
source: https://zudojs.oyinlola.site/learn/dev-environment
---

LESSON 2 OF 84

Start here Foundation

# Your developer environment

Meet the tools a developer uses every day, the terminal, a code editor and the browser's developer tools, and learn to move around your files by typing commands.

- **35 min** to read and try
- **You need:** A computer where you can install programs
- **You build:** A projects folder made from the terminal, opened in VS Code

  [Test yourself](#test)

## Files, folders and paths

Everything on your computer is stored in **files**. A photo is a file. A program is a file. The code you write will be files too. Files live in **folders** (also called **directories**), and folders can hold other folders. Together they form a tree.

At the top of your part of the tree is your **home folder**. It has your name, and it holds your Documents, Downloads and Desktop folders.

A **path** is the address of a file: the list of folders you walk through to reach it.

| System | Home folder | A file in it |
| --- | --- | --- |
| Linux | `/home/ada` | `/home/ada/projects/notes.txt` |
| macOS | `/Users/ada` | `/Users/ada/projects/notes.txt` |
| Windows | `C:\Users\ada` | `C:\Users\ada\projects\notes.txt` |

Linux and macOS separate folders with `/`. Windows uses `\`. Most tools accept `/` on Windows too.

The program that manages files, runs other programs and talks to the hardware is the **operating system**: Windows, macOS or Linux. Most servers on the internet run Linux, so the commands you learn here are the ones you will use on servers later.

## The terminal and the shell

You usually open files by clicking. Developers also do it by typing. The window where you type is the **terminal**. The program inside it that reads your commands and runs them is the **shell**.

| System | How to open a terminal | Usual shell |
| --- | --- | --- |
| Windows | Press Start, type `PowerShell`, open **Windows PowerShell** (or **Terminal**). | PowerShell |
| macOS | Press Cmd + Space, type `Terminal`, press Enter. | zsh |
| Linux | Press Ctrl + Alt + T on most desktops. | bash |

**bash** and **zsh** are close cousins: the commands in this course work the same in both. **PowerShell** is Microsoft's shell. Many common commands have the same name there, and the table in the next section lists the ones that differ.

When the shell is ready for a command, it shows a **prompt**, often ending in `$`, `%` or `>`. In this course every command starts with `$`. Type what comes after it, then press Enter.

> TIP
>
> On Windows, you can also install **WSL** (Windows Subsystem for Linux) and get a real Linux terminal with bash. It is optional. Everything in this course also works in PowerShell.

## Move around your files

The shell is always "standing" in one folder, the **current folder**. When you open a terminal, that is your home folder. Here is a real session on Linux. It makes a folder for your projects and a small notes project inside it:

Terminal on your computer

```bash
$ pwd
~
$ mkdir projects
$ cd projects
$ mkdir task-notes
$ cd task-notes
$ pwd
~/projects/task-notes
$ touch notes.txt
$ mkdir src
$ touch src/app.js
$ ls
notes.txt  src
```

Line by line:

- `pwd` ("print working directory") shows where you are. On your computer it prints the full path, such as `/home/ada` or `/Users/ada`. This page shortens the home folder to `~`, which is also the shell's own short name for it.
- `mkdir projects` ("make directory") creates a folder. It prints nothing when it works. Most commands are silent on success.
- `cd projects` ("change directory") moves into it.
- `touch notes.txt` creates an empty file. `src/app.js` is a path: the file `app.js` inside the folder `src`.
- `ls` ("list") shows what is in the current folder: one file and one folder.

Now put some text in the file and read it back:

Terminal on your computer

```bash
$ echo "Buy milk" > notes.txt
$ echo "Write report" >> notes.txt
$ cat notes.txt
Buy milk
Write report
$ ls src
app.js
$ cd ..
$ ls
task-notes
$ cd task-notes
$ ls -a
.  ..  notes.txt  src
```

- `echo` prints text. `>` sends it into a file instead of the screen, replacing what was there. `>>` adds it to the end.
- `cat notes.txt` prints a file.
- `ls src` lists another folder without going into it.
- `..` means "the folder above this one", so `cd ..` goes up one level. `.` means "this folder". `ls -a` ("all") shows them, plus hidden files, whose names start with a dot.

### The same commands in PowerShell

| Task | bash / zsh | PowerShell |
| --- | --- | --- |
| Where am I? | `pwd` | `pwd` |
| List files | `ls` | `ls` or `dir` |
| List hidden files too | `ls -a` | `ls -Force` |
| Change folder | `cd projects`, `cd ..`, `cd ~` | the same |
| Make a folder | `mkdir projects` | `mkdir projects` |
| Make an empty file | `touch notes.txt` | `New-Item notes.txt` |
| Print a file | `cat notes.txt` | `cat notes.txt` or `type notes.txt` |
| Write text to a file | `echo "Buy milk" > notes.txt` | the same |
| Clear the screen | `clear` | `clear` or `cls` |

The results look a little different in PowerShell. `pwd` prints a small table with a `Path` heading and a path like `C:\Users\ada\projects\task-notes`. `ls` prints a table with the columns `Mode`, `LastWriteTime`, `Length` and `Name`, one row per file or folder. `New-Item` prints the same kind of table for the file it created.

## Running commands

A command is the name of a program, often followed by **arguments**: extra words that tell it what to do. Arguments that start with `-` or `--` are called **options** or **flags**. In `ls -a src`, `ls` is the program, `-a` is an option and `src` is an argument.

When something goes wrong, the shell tells you. Read the message: it nearly always says exactly what is wrong.

Terminal on your computer

```bash
$ cd missing-folder
bash: cd: missing-folder: No such file or directory
$ nodee --version
bash: nodee: command not found
```

The first command asked for a folder that does not exist. The second has a typing mistake: there is no program called `nodee`. In zsh on macOS the second message reads `zsh: command not found: nodee`. PowerShell says the term `nodee` "is not recognized" as the name of a command.

Four habits save a lot of typing:

- Press Tab to complete a file or folder name. Type `cd pro` and press Tab: the shell finishes `projects` for you.
- Press Up to bring back the last command. Press it again for older ones.
- Press Ctrl + C to stop a program that is still running. You will use this to stop your web servers.
- Most programs explain themselves with `--help`. Try `ls --help` (on macOS, `man ls`; in PowerShell, `Get-Help ls`).

## Installing software

You install developer tools in one of two ways:

- **An installer** downloaded from the tool's website. You will install Node.js this way in [Set up your computer](https://zudojs.oyinlola.site/learn/setup).
- **A package manager**: a program that installs other programs with one command. Windows has `winget`, macOS users usually add [Homebrew](https://brew.sh) (`brew`), and Ubuntu and Debian Linux have `apt`. For example, `winget install Git.Git`, `brew install git` or `sudo apt install git` installs Git.

After you install a command-line tool, the shell finds it through a list of folders called the **PATH**. Installers add their folder to it. That is why you must open a *new* terminal after installing: the old one still has the old list. To see where a command lives:

Terminal on your computer

```bash
$ which node
/usr/bin/node
$ which git
/usr/bin/git
```

Your paths can differ, and that is fine. In PowerShell, use `Get-Command node`. If the command is not found, it is not installed, or it is not on your PATH yet.

> Install only from the official site
>
> Download tools only from their official website or your system's package manager. Be careful with commands copied from the internet that start with `sudo` (Linux, macOS) or need "Run as administrator" (Windows): they can change anything on your computer.

## A code editor

Code is plain text, but you want more than a notepad: colours for the different parts of the code, warnings about mistakes, and a terminal in the same window. This course uses [Visual Studio Code](https://code.visualstudio.com/) (VS Code). It is free and works on Windows, macOS and Linux.

1. Download it from [code.visualstudio.com](https://code.visualstudio.com/) and install it.
2. On macOS, open VS Code, press Cmd + Shift + P, type `shell command`, and choose **Install 'code' command in PATH**. On Windows and Linux the installer does this for you.
3. Open a new terminal and check it:

Terminal on your computer

```bash
$ code --version
1.137.0
645f29cc3176500b4b5762ba887cf2a7f0ffdf2c
x64
```

The first line is the version. Yours will probably be newer. Now open your project folder in the editor. `.` means "this folder":

Terminal on your computer

```bash
$ cd ~/projects/task-notes
$ code .
```

VS Code opens with `notes.txt` and `src` in the file list on the left. You can also use **File → Open Folder**. Always open the whole project folder, not a single file: the editor then knows how the files belong together.

Inside VS Code, press Ctrl + ` (the key above Tab) to open a terminal at the bottom of the window. It already stands in your project folder.

## The browser's developer tools

Every modern browser has **developer tools** (devtools) built in. Open them with F12, or Ctrl + Shift + I (Cmd + Option + I on a Mac). You will use two tabs in this course:

- **Console**: shows messages from the page's JavaScript, and lets you type JavaScript and run it right away.
- **Network**: shows every request the page sends and every answer it gets back. You will use it in [How the web works](https://zudojs.oyinlola.site/learn/how-the-web-works).

Open the Console tab now, type the lines below one at a time, and press Enter after each. Or press **Run in browser** to run them in this page's terminal:

console.js

```ts
console.log(2 + 3);
console.log("Tasks:", ["Buy milk", "Write report"].length);
console.log("Today is a good day to learn".toUpperCase());
```

Output of `node console.js` and of the browser terminal

```ts
5
Tasks: 2
TODAY IS A GOOD DAY TO LEARN
```

The browser did the sum, counted the two tasks in the list, and turned the sentence into capital letters. In the devtools Console you will also see `undefined` after each line. That is the console telling you `console.log` gives back no value. You can ignore it.

> NOTE
>
> The Console tab runs code inside the page you have open. The terminal on these lesson pages is different: it runs your examples in a small Node.js-like environment. Both run JavaScript.

## Git and GitHub, briefly

**Git** is a program that records the history of a project. Each time you save a *commit*, Git remembers exactly how every file looked. You can go back, see what changed and when, and work with other people on the same code without overwriting each other's work.

**GitHub** is a website that stores Git projects online, so you can back them up, share them and work on them as a team. Git is the tool; GitHub is one place to keep what it records.

Git is often already installed. Check:

Terminal on your computer

```bash
$ git --version
git version 2.53.0
```

If it is missing, install it from [git-scm.com](https://git-scm.com/downloads) or with your package manager. The [Git lesson](https://zudojs.oyinlola.site/learn/git) teaches it properly, once you have code worth saving.

## Practice

TRY IT YOURSELF

### Build a folder tree

From your home folder, use the terminal to make this tree, then list it. Use only `cd`, `mkdir`, `touch` (or `New-Item`) and `ls`.

```ts
projects/
  shopping/
    list.txt
    archive/
```

**Show a solution**

Terminal on your computer

```bash
$ cd ~/projects
$ mkdir shopping
$ cd shopping
$ touch list.txt
$ mkdir archive
$ ls
archive  list.txt
```

`ls` sorts names alphabetically, so `archive` comes first. In PowerShell, replace `touch list.txt` with `New-Item list.txt`.

TRY IT YOURSELF

### Read the error

A friend types `cd Projects` in their home folder and gets `No such file or directory`, but they are sure they made the folder. What is the most likely mistake, and how can they check?

**Show a solution**

They made `projects` with a small `p`. On Linux and macOS, names are case-sensitive: `Projects` and `projects` are different names. Run `ls` to see the real name, or type `cd pro` and press Tab to let the shell complete it.

TRY IT YOURSELF

### Use the console

In the devtools Console or the browser terminal, print how many letters are in the word `"developer"`, and the word in capitals. Hint: `"text".length` and `"text".toUpperCase()`.

**Show a solution**

letters.js

```ts
console.log("developer".length);
console.log("developer".toUpperCase());
```

Output of `node letters.js` and of the browser terminal

```ts
9
DEVELOPER
```

## Recap

- Files live in folders; a path is a file's address. Linux and macOS use `/`, Windows uses `\`.
- The terminal is the window, the shell is the program reading your commands: bash, zsh or PowerShell.
- `pwd`, `ls`, `cd`, `mkdir`, `touch` and `cat` move around and manage files. Read error messages: they say what is wrong.
- VS Code opens a whole project folder with `code .`. The browser's devtools Console runs JavaScript on the spot.
- Git records a project's history; GitHub stores it online.

Next: what actually happens when a computer runs your code.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
