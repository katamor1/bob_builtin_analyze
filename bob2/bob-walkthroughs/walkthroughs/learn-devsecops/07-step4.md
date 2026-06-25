# Step 4: Secure Deployment

In this step, you'll deploy the application securely using containerization. <br>

### Create and build a Secure Dockerfile

Ensure **Podman desktop** is running on your local system. <br>
Open **Podman desktop** application on your Mac.<br>
OR <br>
On your terminal, run `podman machine start`<br>

In the same chat session, continue to ask Bob to create and build a Dockerfile in the vulnerable-webapp directory.<br>
>_Prompt:_ <br>
Create and build a secure Dockerfile.

---

### Scan Docker image for vulnerabilities

In the same chat session, continue to ask Bob to scan Docker Image with **Trivy** and address the vulnerabilities found.

Note: You may encounter multiple cycles while resolving all vulnerabilities. It's okay to proceed to the next step after completing the first cycle, and return to address the remaining issues once you've finished all the lab tasks.

> _Prompt:_ <br>
Scan the Docker image with Trivy. Check if there are any vulnerabilities found after scanning and only resolve the HIGH, CRITICAL issues.

---

### Now deploy the Docker container

In the same chat session, continue to ask Bob to deploy the Docker image locally and view it. <br>

> _Prompt:_ <br>
Deploy the Docker image locally.

>_Prompt:_ <br>
View the docker containers that are deployed locally.

(Optional) You can also view the containers by opening the Podman desktop app.