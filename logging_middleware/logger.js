const axios = require('axios');

const log = async (level, package, message, token) => {
  try {
    await axios.post('http://4.224.186.213/evaluation-service/logs', {
      stack: 'backend',
      level,
      package,
      message
    }, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
  } catch (error) {
    // As per instructions, no console.log. In a real-world scenario, we'd have a fallback logger.
  }
};

module.exports = log;
