"use strict";
exports.__esModule = true;
var express = require("express");
var path = require("path");
var fs = require("fs");
var app = express();
var http = require('http').Server(app);
app.use(express.static('dist'));
app.get('main.js', function (req, res) {
    res.sendFile('main.js');
});
app.get('/', function (req, res) {
    res.sendFile('index.html', { root: __dirname });
});
app.get('/wasm/:scriptName', function (req, res) {
    joinPathAndSendResourceOr404(res, 'res/wasm/', req.params.scriptName.replace(':', '/'));
});
app.get('/buffer/:bufferName', function (req, res) {
    joinPathAndSendResourceOr404(res, 'res/buffers/', req.params.bufferName.replace(':', '/'));
});
app.get('/model/:modelName', function (req, res) {
    joinPathAndSendResourceOr404(res, 'res/models/', req.params.modelName.replace(':', '/'));
});
app.get('/sound/:soundName', function (req, res) {
    joinPathAndSendResourceOr404(res, 'res/sounds/', req.params.soundName.replace(':', '/'));
});
app.get('/texture/:textureName', function (req, res) {
    joinPathAndSendResourceOr404(res, 'res/textures/', req.params.textureName.replace(':', '/'));
});
http.listen(process.env.PORT || 3000, function () {
    console.log('listening ...');
});
function joinPathAndSendResourceOr404(res, outerDir, fileName) {
    var filePath = path.join(__dirname, outerDir, fileName);
    sendFileOr404(res, filePath);
}
function sendFileOr404(res, filePath) {
    fs.stat(filePath, function (err, stat) {
        if (err === null) {
            res.sendFile(filePath);
        }
        else {
            res.status(404).send("Resource \"" + filePath + "\" not found.");
        }
    });
}
