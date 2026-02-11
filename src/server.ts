import express, { Request, Response } from 'express';
import { OnsetFeature } from './index';
import redoc from 'redoc-express';
import * as path from 'path';
import * as WavDecoder from 'wav-decoder';

const app = express();
const PORT = 8000;

app.use(express.json());
app.use(express.raw({ type: 'audio/wav', limit: '50mb' }));

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

app.get('/docs', redoc({
  title: 'Bounce API Documentation',
  specUrl: '/openapi.json'
}));

app.get('/openapi.json', (_req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, 'openapi.json'));
});

app.put('/analyze/onset', async (req: Request, res: Response) => {
  try {
    const contentType = req.get('Content-Type');
    
    if (!contentType || contentType !== 'audio/wav') {
      return res.status(422).json({ 
        error: 'Content-Type must be audio/wav' 
      });
    }

    if (!Buffer.isBuffer(req.body)) {
      return res.status(400).json({ 
        error: 'Request body must contain audio data' 
      });
    }

    const audioData = await WavDecoder.decode(req.body);
    const channelData = audioData.channelData[0];
    
    const options = {
      function: req.query.function ? parseInt(req.query.function as string) : undefined,
      filterSize: req.query.filterSize ? parseInt(req.query.filterSize as string) : undefined,
      frameDelta: req.query.frameDelta ? parseInt(req.query.frameDelta as string) : undefined,
      windowSize: req.query.windowSize ? parseInt(req.query.windowSize as string) : undefined,
      fftSize: req.query.fftSize ? parseInt(req.query.fftSize as string) : undefined,
      hopSize: req.query.hopSize ? parseInt(req.query.hopSize as string) : undefined,
    };

    const analyzer = new OnsetFeature(options);
    const features = analyzer.process(channelData);

    res.json({ features });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

app.listen(PORT, () => {
  console.log(`Bounce API server running on http://localhost:${PORT}`);
});
