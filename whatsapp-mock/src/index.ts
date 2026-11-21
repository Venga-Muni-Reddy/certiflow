import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { state } from './state.js';
import { messagesRouter } from './routes/messages.js';
import { chaosRouter } from './routes/chaos.js';
import { renderInboxHtml } from './views/inboxHtml.js';

dotenv.config();

export const app = express();
const PORT = process.env.PORT || 4001;

app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/messages', messagesRouter);
app.use('/api', chaosRouter);

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'certiflow-whatsapp-mock',
    chaos: state.chaos,
    totalDelivered: state.stats.totalDelivered,
    timestamp: new Date().toISOString()
  });
});

// Reviewer Visual WhatsApp Phone Inbox
app.get(['/', '/inbox'], (req: Request, res: Response) => {
  const q = (req.query.q as string) || '';
  const messagesList = Array.from(state.messages.values()).sort(
    (a, b) => new Date(b.deliveredAt).getTime() - new Date(a.deliveredAt).getTime()
  );
  const html = renderInboxHtml(messagesList, state.chaos, state.stats, q);
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`[WhatsApp Mock] Stand-in provider running on http://localhost:${PORT}`);
    console.log(`[WhatsApp Mock] Reviewer Inbox UI available at http://localhost:${PORT}/inbox`);
    console.log(`[WhatsApp Mock] Initial Chaos: Failure=${Math.round(state.chaos.failureRate * 100)}%, Timeout=${Math.round(state.chaos.timeoutRate * 100)}%`);
  });
}

export default app;
