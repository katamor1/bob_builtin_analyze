# Exploring bobshell

So, what if you want to have the power of Bob in another IDE, or as part of your CI/CD pipeline? This is where `bobshell` comes in. `bobshell` lives in your terminal or can be invoked as part of a script. It provides direct access to Bob's agentic capabilities.

## Interactive mode

1. Launch a terminal window outside Bob IDE (_MacOS Launchpad -> Terminal_)
2. `cd <workspace-path>/txc-lab/agentic-lab`
3. Type in `bob`
4. bobshell launches in a so-called _Terminal UI_ 
5. Type in _explain @app_
6. A file list will show up as you type. Select `bobverse/app.py` using the arrow keys and hit _Enter_.
7. bobshell goes ahead and explains the file.
8. Type in _"add documentation to @article.py"_ . Select `/bobverse/services/article.py`
9. bobshell adds documentation, and shows the update in a terminal-based diff view. Select _accept once_ to complete the change.
10. Explore other bobshell capabilities at your leisure. Start with the `/help` command to see what is possible.
11. Type in `/quit` to close bobshell.

## Non-interactive mode

In this mode, you can treat bobshell like a UNIX-style utility. It runs "headless", and executes a specific prompt.

1. In the terminal window, enter 
   ``` 
   git diff | bob -p "Summarize the changes and create a PR description"
   ```
2. bobshell starts up without a UI. It uses the prompt specified after `-p`, and takes the output of `git diff` as context for the prompt.
3. You will see that bobshell generates a description. It encloses it in `---output---` tags, to separate it from the "thinking" output that is produced during execution. This makes it easy for an automated script to parse out the response, and use that in an additional step (for example, creating a PR with that description).
4. If no data is passed in, bob will use the files in its current directory (and subdirectories) as context.
5. As an example, run `bob -p "Explain @init_sqlite_db.py"`

Congratulations! We hope this gave you a quick taste for the possibilities of bobshell, extending Bob capabilities beyond its IDE.