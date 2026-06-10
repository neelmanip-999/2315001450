const axios = require('axios');
const log = require('../logging_middleware/logger');

const AUTH_URL = 'http://4.224.186.213/evaluation-service/auth';
const REGISTER_URL = 'http://4.224.186.213/evaluation-service/register';
const DEPOTS_URL = 'http://4.224.186.213/evaluation-service/depots';
const VEHICLES_URL = 'http://4.224.186.213/evaluation-service/vehicles';

const registrationDetails = {
    "email": "neelmanipandey999@gmail.com",
    "name": "Neelmani Pandey",
    "mobileNo": "8865841975",
    "rollNo": "2315001450",
    "accessCode": "RPsgYt",
    "githubUsername": "neelmanip-999"
};

let token = '';
let clientId = '';
let clientSecret = '';

const registerAndAuthenticate = async () => {
    try {
        const registerResponse = await axios.post(REGISTER_URL, registrationDetails);
        clientId = registerResponse.data.clientId;
        clientSecret = registerResponse.data.clientSecret;

        const authResponse = await axios.post(AUTH_URL, {
            "email": registrationDetails.email,
            "name": registrationDetails.name,
            "rollNo": registrationDetails.rollNo,
            "accessCode": registrationDetails.accessCode,
            "clientId": clientId,
            "clientSecret": clientSecret
        });
        token = authResponse.data.token;
        await log('info', 'auth', 'Successfully authenticated.', token);
    } catch (error) {
        console.error('Authentication failed:', error.response ? error.response.data : error.message);
        // Cannot log here as we might not have a token.
        // In a real app, handle this failure, maybe with a retry or a more robust logging setup.
    }
};

const fetchData = async (url) => {
    try {
        const response = await axios.get(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        await log('info', 'handler', `Successfully fetched data from ${url}.`, token);
        return response.data;
    } catch (error) {
        await log('error', 'handler', `Failed to fetch data from ${url}.`, token);
        return null;
    }
};

const knapsack = (items, capacity) => {
    const n = items.length;
    const dp = Array(n + 1).fill(null).map(() => Array(capacity + 1).fill(0));

    for (let i = 1; i <= n; i++) {
        const { Duration, Impact } = items[i - 1];
        for (let w = 1; w <= capacity; w++) {
            if (Duration <= w) {
                dp[i][w] = Math.max(dp[i - 1][w], Impact + dp[i - 1][w - Duration]);
            } else {
                dp[i][w] = dp[i - 1][w];
            }
        }
    }

    let selectedTasks = [];
    let w = capacity;
    for (let i = n; i > 0 && w > 0; i--) {
        if (dp[i][w] !== dp[i - 1][w]) {
            selectedTasks.push(items[i - 1].TaskID);
            w -= items[i - 1].Duration;
        }
    }
    return { maxImpact: dp[n][capacity], selectedTasks: selectedTasks.reverse() };
};


const runScheduler = async () => {
    await registerAndAuthenticate();
    if (!token) {
        await log('fatal', 'scheduler', 'Could not authenticate. Aborting.', token);
        return;
    }

    const depotsData = await fetchData(DEPOTS_URL);
    const vehiclesData = await fetchData(VEHICLES_URL);

    if (!depotsData || !vehiclesData) {
        await log('fatal', 'scheduler', 'Could not fetch depots or vehicles data. Aborting.', token);
        return;
    }

    const allTasks = vehiclesData.vehicles;
    const results = {};

    for (const depot of depotsData.depots) {
        const { ID, "MechanicHours": capacity } = depot;
        const { maxImpact, selectedTasks } = knapsack(allTasks, capacity);
        results[ID] = {
            "TotalImpact": maxImpact,
            "TaskIDs": selectedTasks
        };
        await log('info', 'scheduler', `Scheduled tasks for depot ${ID}.`, token);
    }

    console.log(JSON.stringify({ "schedules": results }, null, 2));
    await log('info', 'scheduler', 'Finished scheduling for all depots.', token);
};

runScheduler();
