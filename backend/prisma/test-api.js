const axios = require('axios');

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required to run the local API smoke test`);
  }
  return value;
}

async function main() {
  console.log('Testing local backend API...');
  try {
    const apiBaseUrl = process.env.TEST_API_BASE_URL || 'http://localhost:3003';
    const email = requiredEnv('TEST_ADMIN_EMAIL');
    const password = requiredEnv('TEST_ADMIN_PASSWORD');
    const loginRes = await axios.post(`${apiBaseUrl}/auth/login`, {
      email,
      password
    });
    const token = loginRes.data.data.access_token;
    console.log('Login successful, token retrieved.');

    // 2. Fetch dashboard stats
    const statsRes = await axios.get(`${apiBaseUrl}/accounting/dashboard-stats`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Dashboard Stats response:', JSON.stringify(statsRes.data, null, 2));

  } catch (err) {
    console.error('API request failed:', err.response?.data || err.message);
  }
}

main();
