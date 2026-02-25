import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import identifyRouter from './routes/identify';

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.get('/', (_req, res) => {
  res.send('Server is running! Use /identify to interact with API.');
});

app.use('/identify', identifyRouter);

const port = process.env.PORT ? Number(process.env.PORT) : 3000;
app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
});