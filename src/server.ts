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

app.get('/model/:modelName', (req: Request, res: Response) => {
  const objPath = req.params.modelName.replace(':', '/');
  const filePath = path.join(__dirname, 'res/models/', objPath);
	sendFileOr404(res, filePath);
});

http.listen(process.env.PORT || 3000, () => {
  console.log('listening ...');
});

function sendFileOr404(res: Response, filePath: string) {
	fs.stat(filePath, (err, stat) => {
    if (err === null) {
      res.sendFile(filePath);
    } else {
      res.status(404).send(`Resource "${filePath}" not found.`);
    }
	})
}