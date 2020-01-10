const http = require('http');
const https = require('https');
const url = require('url');
const _ = require('underscore');
const logger = require('../util/log').logger;

function forward(req, res, next) { 
	logger.debug('route forward');
	if(req.headers['x-forward-url']){
		var f = req.headers['x-forward-url'];
		var fUrl = url.parse(f); 
		var headers = {
		};
		if(req.method=='POST'){
			headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
		}
		var fPath = fUrl.path;
		if(req._parsedUrl.search) fPath += req._parsedUrl.search;
		var opt = {
			protocol: fUrl.protocol,
			hostname: fUrl.hostname,
			port: fUrl.port,
			method: req.method,
			path: fPath,
			headers: headers,
			rejectUnauthorized: false
		}; 
		var _http = opt.protocol=='https:'?https:http;
		var fReq = _http.request(opt,function(fRes){
			var data; 
			fRes.on('data', function(chunk){ 
				if(!data) data = chunk;
				else data = Buffer.concat([data,chunk]);
			});
			fRes.on('end', function(){ 
				if(!data) data='';
				res.send(data);
				res.end();
			});
			fRes.on('error',function(err){
				logger.error('=========err:',err);
				if(!data) data='';
				res.send(data);
				res.end();
			});
		});
		fReq.on('error',function(err){
			logger.error('err:',err);
			res.send('');
			res.end();
		});
		if(req.method=='POST'){
			var bodyStr = _.reduce(req.body,function(r,v,k){
				if(r.length>0) r+='&';
				return r+(k+'='+v);
			},''); 
			fReq.end(encodeURI(bodyStr));
		}else{
			fReq.end();
		}
	}else{
		next();		
	}
}

module.exports = forward;
