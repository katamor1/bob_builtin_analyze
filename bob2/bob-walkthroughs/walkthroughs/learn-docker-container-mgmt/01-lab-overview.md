# Requirements:

Deploy and manage Docker containers in a consistent, repeatable way on your local environment.

# Your task:

Come up with an **Infrastructure as Code (IaC)** solution. <br>
Use **Terraform** to provision Docker infrastructure (network, containers, port mappings). <br>
Use **Ansible** to configure the containers (Nginx with health checks, Redis with memory limits). <br>

# Architecture:

```
┌───────────────────────────────────────────────────────────┐
│                         Docker Host                       │
│                                                           │
│  ┌─────────────────┐                 ┌─────────────────┐  │
│  │                 │                 │                 │  │
│  │    Nginx Web    │                 │  Redis Server   │  │
│  │    Container    │                 │    Container    │  │
│  │    (tx-web)     │                 │   (tx-redis)    │  │
│  │                 │                 │                 │  │
│  │   Internal      │                 │   Internal      │  │
│  │   Port: 80      │                 │   Port: 6379    │  │
│  │                 │                 │                 │  │
│  └────────┬────────┘                 └────────┬────────┘  │
│           │                                   │           │
│           │                                   │           │
│  ┌────────▼────────┐                 ┌────────▼────────┐  │
│  │    External     │                 │    External     │  │
│  │   Port: 8080    │                 │   Port: 6379    │  │
│  └─────────────────┘                 └─────────────────┘  │
│                                                           │
│                   Docker Network (tx-net)                 │
└───────────────────────────────────────────────────────────┘
                              │
                              │
┌─────────────────────────────┴─────────────────────────────┐
│                  Infrastructure as Code                   │
│  ┌─────────────────────┐      ┌───────────────────────┐   │
│  │      Terraform      │      │        Ansible        │   │
│  │  - Creates network  │      │  - Configures Nginx   │   │
│  │  - Builds images    │      │    with health check  │   │
│  │  - Runs containers  │      │  - Configures Redis   │   │
│  │  - Maps ports       │      │    with memory limits │   │
│  │                     │      │  - Performs health    │   │
│  │                     │      │    checks             │   │
│  └─────────────────────┘      └───────────────────────┘   │
└───────────────────────────────────────────────────────────┘
```

### Legend

1. Docker network `tx-net`
2. Container `tx-web` from nginx:stable bound to port 8080
3. Container `tx-redis` from redis:7 bound to port 6379