# Step 3: Enhancing bobverse with a reading time indicator

The articles published in bobverse lack an indicator how long it will take to read them. Let's add this - through Bob.

## Bob suggests an approach

1. Switch to `Plan` mode. As always, there is more than one way to implement this requirement. Let's have Bob weigh in how...
2. Start a new task
3. Type in _"The requirement is to show an estimated reading time in the UI, both for each article and in the feed lists. Create two implementation approaches and describe their pros and cons. Speed of implementation is important."_
4. If Bob asks for details on the calculation method for reading time, select _Use standard 200 WPM calculation_
5. Bob comes up with several approaches, including:
   1. Calculating the reading time in the frontend (client-side)
   2. Calculating the reading time in the backend (server-side)
6. ... and describes the pros and cons for each.
7. We'll go with the **frontend implementation** approach, as it's faster to implement and deploy. Bob most likely agrees.-)

## Bob implements the feature

8. If Bob ends the task with _Bob wants to switch to code mode because: Ready to implement the recommended frontend-only approach for estimated reading time_, click "Approve".
9. In any other case, let's do this manually:
   1. In the same task, switch to `Code` mode.
   2. We're staying in the same task to ensure Bob has the required context.
   3. You could also store Bob's analysis in a markdown file, have it review with the team, and later reference it for Bob to implement.
   4. Type in: _"Implement the frontend calculation approach"_
10. Bob goes ahead and starts the implementation.
11. Once the implementation is complete, open your browser at http://localhost:30402/ again. If you have stopped the application before, just type `make start` in the Bob IDE terminal view.
    1. The articles have an estimated reading time now.
    2. Add a new article, and see how the reading time changes depending on the article length.
       1. Click on "New Article" on the top right.
       2. Fill out the form and click "Publish".
       3. You should see the reading time, calculated based on the article content.

## Bob reviews and improves the implementation

12.  Let's check the implementation before checking it in - and have Bob do it.
13.  Type in _"/review"_.
    1. Notice the `/` - that is one of the so-called "slash commands" - shorthands for prompts and workflows.
14.  Accept the request to switch to `Advanced` mode
15.  Bob reviews your changes step-by-step, commenting as it goes along.
16.  In the end, Bob will publish the findings in the `Bob Findings` view. Accept the tool call once Bob asks.
17.  Explore the findings view:
    1. By default, the view is organized by file. It includes both review findings and Bob tips. To focus on review findings, you can switch to `Sort by Type`, or dive into specific aspects with `Sort by Category``
18.  Select a review finding, e.g., _Magic number 200 should be extracted to a named constant_. Note: the findings that you see may differ, based on the implementation.
19.  Click _Go To Location_ to see the finding in context.
20.  Click on _Investigate and improve code in chat_
21. A new task opens automatically, where Bob is addressing the issue
22. When the task is complete, you'll see that the status of the review finding switches from _open_ to _resolved_ 
23. Explore other review findings at your leisure.

Congratulations! You implemented your first bobverse feature!