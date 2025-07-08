// Simple Express server
const express = require('express');
const app = express();
const PORT = 3002; // Using a different port

app.get('/', (req, res) => {
  res.send('NEXUS AI Backend is running!');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
