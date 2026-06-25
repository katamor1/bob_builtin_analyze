# Step 1: Onboarding

You've been asked to join the team of an existing application called _bobverse_. Unfortunately, all your teammates have left for Disneyworld this week, so there's no one around to help you understand bobverse. Let's see whether Bob can help you...

1. In the Bob chat view, ensure you're in _Ask_ mode.
2. Type in _"What is the purpose of this application?"_
3. Bob starts analyzing the file structure and identifies key files in frontend and backend to look at in more detail.
4. Bob quickly arrives at the high-level purpose. Spoiler Alert: bobverse is a full-stack implementation of a social blogging platform.
5. But only seeing is believing, so:
   1. Start a new task.
   2. Type in _"How do I start this application?"_
6. Bob analyzes key files like readmes and makefiles, and comes up with clear steps. 
7. In the [terminal view](command:workbench.action.terminal.toggleTerminal), enter the following commands **step-by-step**
   ```bash
   make setup
   make init-db 
   make start
   ```
8. Open your browser at http://localhost:30402/
9. While you explore the UI capabilities, start a new task in Bob.
10. Type in _"Explain the application architecture."_
11. This will run for some time, but it's worth the wait: it will produce a comprehensive architecture overview, including mermaid diagrams for component structure and dataflow.
12. Browse through the analysis. Feel free to ask any follow-up questions in the same task. This will ensure that Bob will re-use the architecture information that it gathered in this step.
13. Now, let's save this information as context for subsequent interactions with Bob
14. Switch to `Code` mode
15. Type in _"Store this information under \`context/architecture.md\`"_

Congratulations! You now know what bobverse is about, and are ready to enhance it!
