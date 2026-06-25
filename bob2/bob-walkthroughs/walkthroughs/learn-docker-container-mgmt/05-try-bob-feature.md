# Let’s explore some of Bob’s features:

## 💡 Code Actions

Bob integrates with VS Code’s Code Actions to offer AI-powered suggestions like quick fixes and refactorings.

Try this:
1. Open your Terraform `main.tf` file
2. Select a resource block (e.g., tx_web)
3. Click the light bulb icon and choose **Explain with Bob**

Bob will analyze the code and provide a detailed explanation, including:
- **Purpose and functionality**
- **Key components and interactions**
- **Patterns or techniques used**

---

## 🛠️ Custom Modes

Customize Bob’s behavior for specific tasks or workflows. Modes can be: <br>
**Global** – available across all projects <br>
**Project-specific** – defined within a single project <br>

To create a custom mode:
1. First, switch to **Advanced** Mode in [Bob](command:bob-walkthroughs.views.focusSidebar)
2. Type in the below prompt:
> Create a new mode called IT Automation. It should be able to read configuration files and generate automation scripts (e.g., Ansible playbooks, Terraform modules, Kubernetes manifests) in a safe, idempotent, auditable way and apply best practices.

**Apply the mode:** <br>
Once you have done creating the **IT Automation mode**, lets use that to apply it to this repository. <br>
Select **IT Automation mode** in [Bob](command:bob-walkthroughs.views.focusSidebar) chat and apply best practices to one single Ansible file.
> Example prompt: "Explain what Ansible best practices can be applied to my ansible file @ansible-playbook.yml"

---

## Try in-line edits (⌘K)

Go to any of the **Ansible playbook** or **Ansible role** and make an in-line edit. <br>
Select an Ansible task and initiate an in-line edit by hitting `⌘K` <br>

Try it out: <br>
![inline edit](inline-edit-01.png) 

Type "Apply Ansible fully qualified collection name" <br>
![inline edit](inline-edit-02.png)

Bob will refactor your code with the edits mentioned. You can either 'Accept' or 'Reject' the changes<br>
![inline edit](inline-edit-03.png)

---

## Try add to chat context (⌘L)

Go to any source code file, select a code block and initiate a chat context by hitting `⌘L` <br>
The code snippet will be pasted to Bob chat, where you can then ask your questions or request help. <br>

Try it out: <br>
![inline edit](chat-context-01.png)

Bob chat: <br>
![inline edit](chat-context-02.png)