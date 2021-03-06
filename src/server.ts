import { Response, Request } from 'express';
import * as express from 'express';
import * as path from 'path';
import * as fs from 'fs';

const app = express();
const http = require('http').Server(app);

app.use(express.static('dist'));

app.get('main.js', (req: Request, res: Response) => {
  res.sendFile('main.js');
});

app.get('/', (req: Request, res: Response) => {
  res.sendFile('index.html', {root: __dirname});
});

app.get('/wasm/:scriptName', (req: Request, res: Response) => {
  joinPathAndSendResourceOr404(res, 'res/wasm/', req.params.scriptName.replace(':', '/'));
});

app.get('/buffer/:bufferName', (req: Request, res: Response) => {
  joinPathAndSendResourceOr404(res, 'res/buffers/', req.params.bufferName.replace(':', '/'));
});

app.get('/model/:modelName', (req: Request, res: Response) => {
  joinPathAndSendResourceOr404(res, 'res/models/', req.params.modelName.replace(':', '/'));
});

app.get('/sound/:soundName', (req: Request, res: Response) => {
  joinPathAndSendResourceOr404(res, 'res/sounds/', req.params.soundName.replace(':', '/'));
});

app.get('/texture/:textureName', (req: Request, res: Response) => {
  joinPathAndSendResourceOr404(res, 'res/textures/', req.params.textureName.replace(':', '/'));
});

http.listen(process.env.PORT || 3000, () => {
  console.log('listening ...');
});

function joinPathAndSendResourceOr404(res: Response, outerDir: string, fileName: string): void {
  const filePath = path.join(__dirname, outerDir, fileName);
  sendFileOr404(res, filePath);
}

function sendFileOr404(res: Response, filePath: string) {
  fs.stat(filePath, (err, stat) => {
    if (err === null) {
      res.sendFile(filePath);
    } else {
      res.status(404).send(`Resource "${filePath}" not found.`);
    }
  })
}