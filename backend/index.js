const express = require('express');
const router = express.Router();
const logger = require('morgan');
const cors = require('cors');
const db = require('./src/models');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');

const app = express();

app.use(cors());
app.use(logger('dev'));

app.use(bodyParser.json({ limit: '100mb'}));
app.use(bodyParser.urlencoded({ limit: '100mb', extended: false }));

require('./src/routes')(router);
app.use('/api', router);
app.use(express.json({limit: '100mb'}));
app.use(express.urlencoded({ limit: '100mb', extended: false, parameterLimit: 5000 }));
app.use(cookieParser());
app.use(compression());

const PORT = 9000;

app.listen(PORT, () => {
    db.sequelize
      .authenticate()
      .then(() => {
        console.log('Connection has been established successfully.');
        db.sequelize
          .sync({ force: false })
          .then(() => {
            console.log('Database Synced Successfully');
            console.log(`Server started on port: ${PORT}`);
          })
          .catch((err) => {
            console.log(err);
          });
      })
      .catch((err) => {
        console.error('Unable to connect to the database:', err);
      });
  });
  