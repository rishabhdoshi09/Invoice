const Controller = require('../controller');

module.exports = (router) => {
  router
    .route('/')
    .get(Controller.helloWorld.firstFunction)
  
};
