const express = require('express');
const morgan = require('morgan');
const api = require('./api');
const fs = require('fs/promises');
const { connectToDb } = require('./lib/mongo');
const { connectToRabbitMQ, getChannel } = require('./lib/rabbitmq');

const queue = 'photos';
const app = express();
const port = process.env.PORT || 8000;

app.use(morgan('dev'));
app.use(express.json());
app.use(express.static('public'));

/*
 * All routes for the API are written in modules in the api/ directory.  The
 * top-level router lives in api/index.js. 
 */
app.use('/', api);

app.use('*', function (req, res, next) {
  res.status(404).json({
    error: "Requested resource " + req.originalUrl + " does not exist"
  })
})

connectToDb(async () => {
  await connectToRabbitMQ(queue);
  app.listen(port, () => {
    console.log("== Server is running on port", port);
  })
})
