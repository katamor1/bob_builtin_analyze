# Step 2: fix vulnerabilities

Not all is well in the bobverse code base... A careless colleague has sprinkled security issues and vulnerabilities all over. But with Bob, you'll be able to fix them in no time!

1. Switch to `Advanced` mode.
2. Open [user.py](command:bob-walkthroughs.openDocument?%5B%22bobverse%2Finfrastructure%2Frepositories%2Fuser.py%22%5D)
2. Check `search_users_by_keyword`. Seems that someone got a little sloppy with SQL...
3. Notice the little icon next to the offending line. This has been added by Bob. When you opened the file, Bob automatically ran a vulnerability detection algorithm, and flagged the vulnerable lines.
4. But Bob can do even more: Hover over `session.execute`.
5. Bob shows a description of the problem.
6. Click the link _Investigate and Improve Code in Chat_ that is shown under the description.
7. Bob starts a new task that analyzes the issue, and comes up with several alternative solutions to fix the issue.
8. Optional: Select _Implement solution 1: Use SQLAlchemy ORM with parameterized queries_, and let Bob fix the issue.