# Notification System Design

## Stage 1: API Contracts

This section defines the REST API contracts for the notification system.

### Real-time Delivery: SSE vs. WebSockets

For real-time updates, **Server-Sent Events (SSE)** is the recommended approach.

*   **Justification:** The primary requirement is for the server to push notifications to the client. This is a one-way communication flow. SSE is designed specifically for this purpose and is simpler to implement on both the client and server compared to WebSockets. WebSockets provide a more complex, bi-directional communication channel which is overkill for this use case. SSE also has automatic reconnection handling built-in, which is a useful feature for maintaining a persistent connection.

### Endpoints

#### 1. Get Notifications

*   **Endpoint:** `GET /notifications`
*   **Description:** Retrieves a list of notifications for a user.
*   **Query Parameters:**
    *   `userId` (string, required): The ID of the user.
    *   `limit` (integer, optional, default: 20): The maximum number of notifications to return.
    *   `since` (string, optional, ISO 8601 date): Fetches notifications created after this timestamp.
*   **Response (200 OK):**
    ```json
    {
      "notifications": [
        {
          "id": "notif_123",
          "type": "Placement",
          "message": "New placement opportunity at XYZ Corp.",
          "isRead": false,
          "createdAt": "2026-06-10T10:00:00Z"
        }
      ]
    }
    ```

#### 2. Mark Notification as Read

*   **Endpoint:** `POST /notifications/{notificationId}/read`
*   **Description:** Marks a specific notification as read.
*   **Request Body:**
    ```json
    {
      "userId": "user_abc"
    }
    ```
*   **Response (200 OK):**
    ```json
    {
      "message": "Notification marked as read."
    }
    ```

#### 3. Real-time Notification Stream (SSE)

*   **Endpoint:** `GET /notifications/stream`
*   **Description:** Opens an SSE connection to receive real-time notifications.
*   **Headers:**
    *   `Accept: text/event-stream`
*   **Response:** A stream of server-sent events.
    ```
    event: new_notification
    data: {"id":"notif_124","type":"Event","message":"Tech conference this weekend.","isRead":false,"createdAt":"2026-06-10T11:00:00Z"}

    event: new_notification
    data: {"id":"notif_125","type":"Result","message":"Your exam results are out.","isRead":false,"createdAt":"2026-06-10T11:05:00Z"}
    ```

---

## Stage 2: Persistent Storage Schema

This section proposes a persistent storage schema and discusses scaling considerations.

### Storage Choice: NoSQL (MongoDB)

A NoSQL database like **MongoDB** is proposed for storing notifications.

*   **Justification:**
    *   **Flexible Schema:** Notification data can evolve. A NoSQL database allows for easy schema changes without complex migrations.
    *   **High Write Throughput:** Notification systems are typically write-heavy. MongoDB is designed for high-speed writes.
    *   **Scalability:** MongoDB can be easily scaled horizontally by sharding the data across multiple servers, which is crucial for handling large volumes of notifications.

### Schema

A single collection named `notifications` will be used.

*   **Collection:** `notifications`
*   **Document Structure:**
    ```javascript
    {
      "_id": ObjectId("..."),
      "userId": "user_abc", // Indexed
      "type": "Placement", // e.g., 'Placement', 'Result', 'Event'
      "message": "New placement opportunity at XYZ Corp.",
      "isRead": false, // Indexed
      "createdAt": ISODate("2026-06-10T10:00:00Z"), // Indexed
      "source": "Campus Drive" // Optional: source of the notification
    }
    ```

### Data Volume Scaling Problems & Queries

*   **Problem:** The `notifications` collection will grow very large, very quickly. This will lead to slow read queries, especially when filtering for unread notifications for a specific user. Without proper indexing, the database would have to scan the entire collection for every query.

*   **Queries Mapping to Stage 1 APIs:**

    1.  **Get Notifications (`GET /notifications`):**
        ```javascript
        db.notifications.find({
          "userId": "user_abc"
        }).sort({ "createdAt": -1 }).limit(20);
        ```
        *   This query will be slow on a large collection without an index on `userId` and `createdAt`.

    2.  **Mark Notification as Read (`POST /notifications/{notificationId}/read`):**
        ```javascript
        db.notifications.updateOne(
          { "_id": ObjectId("notif_123"), "userId": "user_abc" },
          { "$set": { "isRead": true } }
        );
        ```
        *   This query relies on the primary `_id` index and will be fast.

    3.  **Get Unread Notifications (A common use case):**
        ```javascript
        db.notifications.find({
          "userId": "user_abc",
          "isRead": false
        }).sort({ "createdAt": -1 });
        ```
        *   This is a very common query that will become slow as the number of notifications per user grows. A composite index on `(userId, isRead, createdAt)` would be needed to optimize this.

---

## Stage 3: Database Performance & Optimization

This section analyzes the performance of the notification query and proposes an optimal index.

### Slow Query Analysis

The provided query is:
`SELECT * FROM notifications WHERE student_id = 1234 AND isRead = false ORDER BY createdAt DESC;`

*   **Why it is slow:** Without a proper index, the database has to perform a full scan of the `notifications` table. As the table grows with millions of records, this operation becomes increasingly slow. It would have to load a massive number of records into memory to filter by `student_id` and `isRead`, and then sort them.

*   **Why indexing every column is bad:**
    *   **Write Performance:** Every time a record is inserted, updated, or deleted, every index on the table must also be updated. This adds significant overhead to write operations.
    *   **Storage Overhead:** Each index consumes additional disk space. With many indexes, this can become substantial.
    *   **Query Planner Complexity:** While the query planner is smart, having too many indexes can sometimes lead it to choose a suboptimal index for a particular query, resulting in poor performance.

### Optimal Composite Index

To optimize the query, a composite index should be created. The order of columns in the index is crucial.

*   **Optimal Index Definition:**
    ```sql
    CREATE INDEX idx_notifications_student_read_created
    ON notifications (student_id, isRead, createdAt DESC);
    ```

*   **Justification:**
    1.  `student_id`: This is the most selective filter and should be first. The database can quickly narrow down the search to a specific user.
    2.  `isRead`: This is the next filter. After selecting the user, the database can further filter by the read status.
    3.  `createdAt DESC`: Including this in the index allows the database to retrieve the data in the already sorted order, avoiding a costly sorting operation.

---

## Stage 4: High-Throughput Mitigation Strategies

This section proposes strategies to handle high-frequency page loads.

### 1. Caching Layer with Redis

A Redis caching layer can be introduced to dramatically reduce database load.

*   **Strategy:**
    1.  When a user requests their notifications, first check if they exist in the Redis cache for that `userId`.
    2.  **Cache Hit:** If found, return the notifications directly from Redis. This is extremely fast.
    3.  **Cache Miss:** If not found, query the database, store the result in Redis with a Time-To-Live (TTL, e.g., 1-5 minutes), and then return the result to the user.
    4.  **Write-through/Write-around:** When a new notification is created, it can be pushed to the cache (or the cache for that user can be invalidated) to ensure the cache doesn't become stale. For marking as read, the cache should be updated or invalidated.

*   **Benefit:** This significantly reduces the number of read queries hitting the primary database, improving performance and scalability.

### 2. Cursor Pagination

Standard offset-based pagination (`LIMIT`/`OFFSET`) becomes inefficient with large datasets because the database still has to scan through the `OFFSET` number of rows.

*   **Strategy:** Cursor-based pagination uses a "cursor" (a pointer to a specific record in the dataset) to fetch the next set of results. The cursor is typically the value of the column the data is sorted by from the last item in the previous set.

*   **Example Flow:**
    1.  **Initial Request:** `GET /notifications?userId=user_abc&limit=20`
    2.  **Response:** Returns the first 20 notifications and includes a `nextCursor` which could be the `createdAt` timestamp of the last notification.
    3.  **Next Request:** `GET /notifications?userId=user_abc&limit=20&cursor=2026-06-10T09:00:00Z`
    4.  The backend query would then be:
        ```sql
        SELECT * FROM notifications
        WHERE student_id = 1234 AND isRead = false AND createdAt < '2026-06-10T09:00:00Z'
        ORDER BY createdAt DESC
        LIMIT 20;
        ```

*   **Tradeoffs:**
    *   **Pros:** Very efficient for large datasets as it avoids the `OFFSET` scan. It provides stable pagination even if new items are added to the list.
    *   **Cons:** It's more complex to implement on the client and server. It doesn't allow jumping to a specific page (e.g., page 5) directly. The client can only go to the next or previous page.

---

## Stage 5: Reliable Broadcast System

This section analyzes the provided pseudocode for sending notifications and proposes a more reliable, asynchronous architecture.

### Analysis of Blocking Sequential Pseudocode

The provided pseudocode is:
```
function notify_all(student_ids, message) {
  for student_id in student_ids {
    send_email(student_id, message)  // calls Email API
    save_to_db(student_id, message)  // DB insert
    push_to_app(student_id, message) // calls Notification service
  }
}
```

*   **Failure Edge Cases:**
    1.  **Midway Failure:** If any of the `send_email`, `save_to_db`, or `push_to_app` calls fail for a student, the entire loop for that student stops, and subsequent students in the list will not be notified.
    2.  **Blocking Operation:** The loop is synchronous and blocking. If there are 50,000 students, this function will take a very long time to complete, likely leading to a request timeout.
    3.  **No Retries:** If an API call fails due to a transient network issue, there is no mechanism to retry the operation. The notification for that student will be lost.
    4.  **Database Contention:** High-frequency, sequential database inserts can cause contention and slow down the process.

### Asynchronous Message Queue Redesign

To address these issues, an asynchronous Message Queue (like RabbitMQ or AWS SQS) architecture is proposed.

*   **Revised, Non-blocking Pseudocode:**

    **1. API Endpoint (The part that receives the initial request)**
    ```
    // This function is now very fast and non-blocking.
    function notify_all_async(student_ids, message) {
      // Get a connection to the message queue
      const queue = get_message_queue('notification_jobs');

      for student_id in student_ids {
        // Create a job payload
        const job = {
          student_id: student_id,
          message: message,
          retry_count: 0
        };

        // Enqueue the job. This is a very fast, non-blocking operation.
        queue.add(job);
      }

      // Immediately return a success response to the client.
      return { "status": "Notifications are being processed." };
    }
    ```

    **2. Background Worker**
    ```
    // This runs as a separate, persistent process.
    // You can have many workers running in parallel to process jobs.
    function notification_worker() {
      const queue = get_message_queue('notification_jobs');
      const dead_letter_queue = get_message_queue('failed_notification_jobs');

      // Continuously listen for new jobs on the queue.
      queue.process(async (job) => {
        try {
          // Process the job
          await send_email(job.student_id, job.message);
          await save_to_db(job.student_id, job.message);
          await push_to_app(job.student_id, job.message);

        } catch (error) {
          // If processing fails, implement a retry mechanism.
          if (job.retry_count < 3) { // e.g., max 3 retries
            job.retry_count++;
            // Re-queue the job with an exponential backoff delay.
            queue.add(job, { delay: 60000 * job.retry_count });
          } else {
            // If it fails after all retries, move it to a dead-letter queue for manual inspection.
            dead_letter_queue.add(job);
          }
        }
      });
    }
    ```

*   **Benefits of this design:**
    *   **Non-blocking & Fast:** The API endpoint is now extremely fast as it only has to enqueue jobs.
    *   **Reliability & Retries:** The background worker can handle failures and retry jobs, ensuring notifications are not lost due to transient errors.
    *   **Scalability:** You can run multiple instances of the `notification_worker` to process notifications in parallel, allowing the system to handle a very high throughput.
    *   **Decoupling:** The API is decoupled from the notification sending logic. This makes the system more resilient and easier to maintain.

---

## Stage 6: Priority Inbox Implementation

This section explains the architectural choices for implementing a priority inbox.

### Architectural Choices

To maintain the Top 'n' unread notifications, a **Min-Heap** based Priority Queue is the ideal data structure.

*   **Why a Min-Heap?**
    *   A Min-Heap always keeps the element with the lowest priority at the root. In our case, we can define a custom comparator so that the "least important" notification is at the root.
    *   When a new notification arrives, we can compare it with the root of the heap. If the new notification is more important, we can remove the root and insert the new notification. This operation is very efficient (O(log n)).
    *   This allows us to maintain a constant size ('n') heap of the most important notifications at all times.

*   **Priority Sorting:**
    1.  **Custom Weights:** The priority will be determined by a custom weight assigned to each notification type:
        *   `Placement`: 3 (highest priority)
        *   `Result`: 2
        *   `Event`: 1 (lowest priority)
    2.  **Recency:** If two notifications have the same weight, the more recent one (based on `Timestamp`) will be considered higher priority.

This approach ensures that we can efficiently process a stream of notifications and always have the top 'n' most important ones ready to be displayed.
