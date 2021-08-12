import express, { static } from 'express';
const app = express();
const port = 3000;

// Set up the server
app.use(static('public'));
app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});


