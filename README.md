# Backend Engineering Assessment

This repository contains the solution for a multi-stage backend engineering challenge. The project is divided into several components, including an algorithmic vehicle maintenance scheduler, a detailed notification system design, and a functional priority inbox implementation.

## Project Structure

-   `logging_middleware/`: A simple logging utility to send logs to the evaluation service API.
-   `vehicle_maintenance_scheduler/`: A Node.js script that solves a 0/1 Knapsack problem to schedule vehicle maintenance based on maximizing operational impact within a given budget.
-   `notification_app_be/`: A Node.js script that processes a stream of notifications and prioritizes them using a Min-Heap data structure to maintain the top 'n' most important items.
-   `notification_system_design.md`: A comprehensive markdown file detailing the architecture and design decisions for a scalable notification system, covering API contracts, database schema, query optimization, and high-throughput strategies.
-   `.gitignore`: Standard git ignore file for Node.js projects.

## Setup and Usage

### Prerequisites

-   [Node.js](https://nodejs.org/) (LTS version recommended)
-   [npm](https://www.npmjs.com/) (comes with Node.js)

### Installation

You need to install the dependencies for each module separately.

1.  **Logging Middleware:**
    ```bash
    cd logging_middleware
    npm install
    cd ..
    ```

2.  **Vehicle Maintenance Scheduler:**
    ```bash
    cd vehicle_maintenance_scheduler
    npm install
    cd ..
    ```

3.  **Notification App Backend:**
    ```bash
    cd notification_app_be
    npm install
    cd ..
    ```

### Running the Applications

#### 1. Vehicle Maintenance Scheduler

This script will register the user (a one-time operation), authenticate, fetch depot and vehicle data, and then run the scheduling algorithm.

```bash
cd vehicle_maintenance_scheduler
node scheduler.js
```
**Note:** The registration API only allows an email to be registered once. Subsequent runs will show an authentication failure, which is expected behavior. The output of the scheduler will be printed to the console as a JSON object.

#### 2. Priority Inbox

This script fetches notifications from an API and uses a priority queue to determine the top 10 most important ones.

```bash
cd notification_app_be
node priorityInbox.js
```
**Note:** This script requires the `clientId` and `clientSecret` obtained during the initial registration from the scheduler script. You will need to manually update these values in the `priorityInbox.js` file to run it successfully.
