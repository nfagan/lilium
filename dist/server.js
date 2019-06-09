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
app.get('/model/:modelName', function (req, res) {
    var objPath = req.params.modelName.replace(':', '/');
    var filePath = path.join(__dirname, 'res/models/', objPath);
    sendFileOr404(res, filePath);
});
http.listen(process.env.PORT || 3000, function () {
    console.log('listening ...');
});
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
