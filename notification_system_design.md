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
