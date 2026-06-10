const axios = require('axios');
const log = require('../logging_middleware/logger');

const AUTH_URL = 'http://4.224.186.213/evaluation-service/auth';
const NOTIFICATIONS_URL = 'http://4.224.186.213/evaluation-service/notifications';

// This would be securely stored and retrieved in a real application
const clientId = "your_client_id"; // Replace with your actual client ID
const clientSecret = "your_client_secret"; // Replace with your actual client secret
const registrationDetails = {
    "email": "neelmanipandey999@gmail.com",
    "name": "Neelmani Pandey",
    "rollNo": "2315001450",
    "accessCode": "RPsgYt",
};

let token = '';

const authenticate = async () => {
    try {
        const authResponse = await axios.post(AUTH_URL, { ...registrationDetails, clientId, clientSecret });
        token = authResponse.data.token;
        await log('info', 'auth', 'Successfully authenticated for notifications.', token);
    } catch (error) {
        // Not using custom logger here as token might be the issue.
        console.error('Notification auth failed:', error.response ? error.response.data : error.message);
    }
};

const priorityWeights = {
    'Placement': 3,
    'Result': 2,
    'Event': 1
};

class PriorityQueue {
    constructor(maxSize, comparator) {
        this.heap = [];
        this.maxSize = maxSize;
        this.comparator = comparator;
    }

    _getParentIndex(i) { return Math.floor((i - 1) / 2); }
    _getLeftChildIndex(i) { return 2 * i + 1; }
    _getRightChildIndex(i) { return 2 * i + 2; }

    _swap(i, j) {
        [this.heap[i], this.heap[j]] = [this.heap[j], this.heap[i]];
    }

    _siftUp(i) {
        let parent = this._getParentIndex(i);
        while (i > 0 && this.comparator(this.heap[i], this.heap[parent]) < 0) {
            this._swap(i, parent);
            i = parent;
            parent = this._getParentIndex(i);
        }
    }

    _siftDown(i) {
        let minIndex = i;
        const left = this._getLeftChildIndex(i);
        if (left < this.heap.length && this.comparator(this.heap[left], this.heap[minIndex]) < 0) {
            minIndex = left;
        }
        const right = this._getRightChildIndex(i);
        if (right < this.heap.length && this.comparator(this.heap[right], this.heap[minIndex]) < 0) {
            minIndex = right;
        }
        if (i !== minIndex) {
            this._swap(i, minIndex);
            this._siftDown(minIndex);
        }
    }

    add(item) {
        if (this.heap.length < this.maxSize) {
            this.heap.push(item);
            this._siftUp(this.heap.length - 1);
        } else if (this.comparator(item, this.heap[0]) > 0) {
            this.heap[0] = item;
            this._siftDown(0);
        }
    }

    getTopN() {
        return this.heap.sort(this.comparator).reverse();
    }
}

const notificationComparator = (a, b) => {
    const priorityA = priorityWeights[a.Type] || 0;
    const priorityB = priorityWeights[b.Type] || 0;

    if (priorityA !== priorityB) {
        return priorityA - priorityB;
    }
    return new Date(a.Timestamp) - new Date(b.Timestamp);
};

const processNotifications = async () => {
    await authenticate();
    if (!token) {
        return;
    }

    try {
        const response = await axios.get(NOTIFICATIONS_URL, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const notifications = response.data.notifications;
        await log('info', 'handler', 'Successfully fetched notifications.', token);

        const topN = 10;
        const pq = new PriorityQueue(topN, notificationComparator);

        for (const notification of notifications) {
            pq.add(notification);
        }

        const topNotifications = pq.getTopN();
        console.log(JSON.stringify({ "top_notifications": topNotifications }, null, 2));
        await log('info', 'scheduler', 'Successfully processed and prioritized notifications.', token);

    } catch (error) {
        await log('error', 'handler', 'Failed to process notifications.', token);
    }
};

processNotifications();
