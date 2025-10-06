import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getRoomState, upsertRoomState } from '../services/db';

const router = Router();

router.post('/', async (req, res) => {
  const id = (req.body.id as string) || uuidv4().slice(0, 8);
  // create default state if not exists
  const state = req.body.state || { source: null, isPlaying: false, time: 0 };
  await upsertRoomState(id, state);
  res.json({ roomId: id, state });
});

router.get('/:id/state', async (req, res) => {
  const state = await getRoomState(req.params.id);
  res.json({ state });
});

export default router;
