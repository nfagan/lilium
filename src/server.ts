import { Response, Request } from 'express';
import * as express from 'express';

const app = express();
const http = require('http').Server(app);

app.use(express.static('dist'));

app.get('main.js', (req: Request, res: Response) => {
  res.sendFile('main.js');
});

app.get('/', (req: Request, res: Response) => {
  res.sendFile('index.html', {root: __dirname});
});

http.listen(process.env.PORT || 3000, () => {
  console.log('listening ...');
});
