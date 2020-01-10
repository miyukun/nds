var express = require('express');
var router = express.Router();
var logger = require('../util/log').logger;
/* GET home page. */
router.get('/', function(req, res, next) { 
  logger.debug('route /'); 
    res.render('file', { title: 'NDS',kakaka:'哈哈哈哈哈' });
 });

module.exports = router;
