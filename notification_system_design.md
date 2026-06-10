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
