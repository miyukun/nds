var express = require('express');
var router = express.Router();
var error = require('../util/error');
var api = require('../util/nvsWebAPI');
const logger = require('../util/log').logger;
const _ = require('underscore');

function doPost(method, req, res)
{		

	logger.debug(req.body);
	var name = req.body.name;
	var para = req.body.para;
	api.getConn(name, function(conn){
		if(!conn){
			res.json(_.extend({},error('SERVICE_BUSY')));
		}else{
			conn[method](function(r){
				if(r.errorCode != 0){					
					res.json(_.extend({},error('INTERNAL_ERROR')));
				}else{
					res.json(_.extend({},error('SUCCESS'),{
						r: r
					}));
				}
			},this,para);
		}
	});
}

router.get('/', function(req, res, next) { 
	logger.debug('route /'); 
	  res.render('nvs', { title: 'NDS',kakaka:'哈哈哈哈哈' });
   });

router.post('/getGroupList', (req, res)=>{ 
	logger.debug('route nvs/getGroupList')
	doPost('getGroupList', req, res);
});

router.post('/getTestAlertList', (req, res)=>{
	logger.debug('route nvs/getTestAlertList')
	doPost('getTestAlertList', req, res);
});

router.post('/getTestAlertLogList', (req, res)=>{
	logger.debug('route nvs/getTestAlertLogList')
	doPost('getTestAlertLogList', req, res);
});

router.post('/getTestResultList', (req, res)=>{
	logger.debug('route nvs/getTestResultList')
	doPost('getTestResultList', req, res);
});

router.post('/getTopologyDetails', (req, res)=>{
	logger.debug('route nvs/getTopologyDetails')
	doPost('getTopologyDetails', req, res);
});


module.exports = router;
