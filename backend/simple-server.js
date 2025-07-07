const express = require('express');
const app = express();
const PORT = 3001;

app.get('/', (req, res) => {
  res.send('NEXUS AI Backend is running!');
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
