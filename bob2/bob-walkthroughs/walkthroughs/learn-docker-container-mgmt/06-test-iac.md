# Test your IaC solution

>_Example bootstrap prompt:_
<br>
Test the infrastructure as code solution locally.

**Try it out!** <br>

> _Prompt_
```
abc
```


[Test IaC](command:bob-walkthroughs.chat.startPrompt?%5B%22Test%20the%20infrastructure%20as%20code%20solution%20locally.%22%5D)



**View the changes made** <br>

1. Open Podman desktop to view the running containers.
2. Nginx server check: Open the browser and navigate to `http://localhost:8080` to view the nginx home page.
3. Ngnix health check: Open the browser and navigate to `http://localhost:8080/health` to view the nginx health check.
4. Redis server check: On the terminal, run the command `redis-cli ping` to verify the Redis service is running.
5. Redis memory usage check: On the terminal, run the command `redis-cli info memory` to check the Redis memory usage.