var express = require('express');
var fs = require('fs');
var path = require('path');
var router = express.Router();
var _ = require('underscore');
var logger = require('../util/log').logger;
var error = require('../util/error');
var lineReader = require('line-reader');
var ftpClient = require('ftp');
var ftp = new ftpClient();
var sftpClient = require('ssh2-sftp-client');
var sftp = new sftpClient();
var stream = require('stream');
var util = require('util');
const  {Readable}  = require('stream');
var cfgPath = path.join(__dirname, '../conf/file.json');
var sFTPConn = {};
var FTPConn = {};

const MAX_FILE_SIZE = 10*1024*1024;

router.get('/', function(req, res, next) { 
  logger.debug('route file'); 
  res.render('file');
});

router.post('/list',function(req, res, next) {
  logger.debug('route file/list'); 
   fileProcess(req,res,listDir);
});

router.post('/csv', function(req, res, next) {
  logger.debug('route file/csv'); 
   fileProcess(req,res,parseFile);
});
router.post('/json', function(req,res,next){
  logger.debug('route file/json'); 
 	var datas = req.body;
    var count = datas.length;
	if(count&&count>0){
    _.each(datas,function(cfg){
    	cfg.isJson = true;
    });
    fileProcess(req,res,parseFile);
  }else{
    res.json(error('INVALID_PARAMETERS'));
  }
});

var fileProcess = function(req,res,fileCb){
  var returnVal = _.extend({},error('SUCCESS'));
  var datas = req.body;
  var count = datas.length;
  if(count&&count>0){
    _.each(datas,function(cfg){
      fileCb(cfg,function(tag,obj){
        returnVal[tag] = obj;
        count--;
        if(count==0){
          res.json(returnVal)
        }
      });
    });
  }else{
    res.json(error('INVALID_PARAMETERS'));
  }
};

//遍历文件夹
var listDir = function(cfg,cb){
  var retVal = [];
  var pathitem = getPathItem(cfg.path);
   if(pathitem){
    if(pathitem.type=='ftp'){
       listFtpDir(cfg,pathitem,cb);
    }
    else if(pathitem.type=='sftp'){
       listSFtpDir(cfg,pathitem,cb);
    }else{
       listLocalDir(cfg,pathitem,cb)
    }
  }else {
     //如果没有找到相应的项，返回空数组
    cb(cfg.tag,retVal);
  }
};

var listFtpDir = function(cfg,pathitem,cb){
   var retVal = [];
  ftp.once('ready', function() {
    ftp.list(function(err, list) {
      if (err) {
        logger.error(err);
      }
      retVal = _.pluck(list,'name');
      cb(cfg.tag,retVal);
      ftp.end();
    });
  });
  ftp.once('error', function(err) {
    logger.error('ftp error:'+err); 
    cb(cfg.tag,retVal);
    ftp.end();
  });
  ftp.connect({
    host: pathitem.host,
    port: pathitem.port,
    user: pathitem.user,
    password: pathitem.pass
  });
};

var listSFtpDir = function (cfg,pathitem,cb) {
   var retVal = [];
  var [sftpClient,isNew] = getSFTPConn(cfg.path);
  sftpClient.then(() => {
    return sftp.list(pathitem.path);
  }).then((data) => {
    retVal = _.pluck(data,'name');
     cb(cfg.tag,retVal);
  }).catch((err) => {
    logger.debug('发生错误：'+err.message);
    removeSFTPConn(cfg.path);
    cb(cfg.tag,retVal);
  });
};

var listLocalDir = function (cfg,pathitem,cb) {
   var retVal = [];
  fs.readdir(getFilePath(pathitem.path), function(err,files){
    if(!err){
      retVal = files;
    }
     //发生错误，返回空数组
    cb(cfg.tag,retVal);
  });
};

//解析文件
var parseFile = function(cfg,cb){
  var files = getFileCfgs();
  var pathitem = files[cfg.path];
  if(pathitem){
    var retVal = [];
     var filepath = files[cfg.path].path+cfg.filename;
    filepath = getFilePath(filepath);
     if(cfg.filename.search('\\.\\.')!=-1){
      logger.debug('文件路径非法:'+filepath);
      cb(cfg.tag,[]);
      return;
    }
    if(pathitem.type=='ftp'){
       ftpFile(cfg,pathitem,cb);
    }
    else if(pathitem.type=='sftp'){
       sftpFile(cfg,cb);
    }
    else{
       var filepath = getFilePath(pathitem.path);
      localFile(cfg,filepath,cb);
    }
  }else{
    logger.debug('找不到文件夹项');
    //没有对应的文件，返回空数组
    cb(cfg.tag,[]);
  }
};

var ftpFile = function(cfg,pathitem,cb){
  var retVal = [];
  ftp.once('ready', function() {
    ftp.get(cfg.filename, function(err, stream) {
      if (err) {
        cb(cfg.tag,retVal);
      }else{
        stream.once('close', function() { ftp.end(); });
        var readStream = new ReadStream();
        stream.pipe(readStream);
        if (cfg.isJson) {
          streamReadJSON(stream,stream,cfg,cb);
        }else {
          streamReadCSV(stream, readStream, cfg, cb);
        }
      }
    });
  });
  ftp.connect({
    host: pathitem.host,
    port: pathitem.port,
    user: pathitem.user,
    password: pathitem.pass
  });
};

var sftpFile = function(cfg,cb){
  var retVal = [];
  var [sftpClient,isNew] = getSFTPConn(cfg.path);
  sftpClient.then(() => {
    return sftp.get(cfg.filename);
  }).then((stream) => {
    stream.on('end', () => {
      logger.debug('There will be no more data.');
    });
    stream.on('close', () => {
      logger.debug('close.');
    });
    stream.on('error', (err) => {
      logger.debug(err);
    });
    if (cfg.isJson) {
      streamReadJSON(null,stream,cfg,cb);
    }else {
      streamReadCSV(null, stream, cfg, cb);
    }
  }).catch((err) => {
    logger.debug('发生错误：'+err);
    removeSFTPConn(cfg.path);
    if(!isNew){
      sftpFile(cfg,cb);
    }else{
      cb(cfg.tag,retVal);
    }
  });
};

var localFile = function (cfg, filepath, cb) {
  var filename = filepath + cfg.filename;
  if (fs.existsSync(filename)) {
    var stream = fs.createReadStream(filename, { start: 0, end: MAX_FILE_SIZE });
    if (cfg.isJson) {
      streamReadJSON(null,stream,cfg,cb);
    }else{
      streamReadCSV(null,stream,cfg,cb);
    }
  } else {
    logger.debug('找不到文件');
    //没有对应的文件，返回空数组
    cb(cfg.tag, []);
  }
};

var streamReadCSV = function(srcStream,stream,cfg,cb){
  var retVal = [];
  var sLength = 0;
  var lineSp = cfg.lineSp?cfg.lineSp:'\n';
  var columnSp = cfg.columnSp?cfg.columnSp:' ';
  var fieldList = cfg.fieldList?cfg.fieldList:[];
  var headerLine = cfg.headerLine;

  lineReader.eachLine(stream, {separator: lineSp, encoding: 'utf8'}, function (line) {
    sLength+=line.length;
    if(sLength>MAX_FILE_SIZE){
      return false;
    }
    if (line.trim() != "") {
      var columns = line.split(columnSp);
      retVal.push(_.object(fieldList, columns));
    }
  },function(err){
    if(srcStream){
      srcStream.unpipe(stream);
    }
    if(err){
      logger.error('读取文件出错:' + err);
    }
    if (headerLine) {
      retVal = _.rest(retVal)
    }
    cb(cfg.tag,retVal);
  });
};

var streamReadJSON = function(srcStream,stream,cfg,cb){
  var retVal;
  var sLength = 0;
  stream.on('data', (chunk) => {
    if(sLength>MAX_FILE_SIZE){
      if(srcStream){
        srcStream.unpipe(stream);
      }
      stream.destroy();
     }
    sLength+=chunk.length;
    if(retVal){
    	retVal = Buffer.concat([retVal, chunk]);
    }else{
    	retVal = chunk;
    }
  });
  stream.on('close', () => {
	try{
		cb(cfg.tag,JSON.parse(retVal));
	}catch(e){
		logger.error('json parse fail:', e, retVal.length, sLength);
		cb(cfg.tag,[]);
	}
    
  });
};

var getSFTPConn = function (path) {
  if(!sFTPConn[path]){
    var files = getFileCfgs();
    var pathitem = files[path];
    sFTPConn[path] = sftp.connect({
      host: pathitem.host,
      port: pathitem.port,
      user: pathitem.user,
      password: pathitem.pass
    });
    return [sFTPConn[path],true];
  }
  return [sFTPConn[path],false];
};

var getFTPConn = function (path) {
  if(!FTPConn[path]){
    var files = getFileCfgs();
    var pathitem = files[path];
    ftp.connect({
      host: pathitem.host,
      port: pathitem.port,
      user: pathitem.user,
      password: pathitem.pass
    });
    FTPConn[path] = ftp;
    return [FTPConn[path],true];
  }
  return [FTPConn[path],false];
};

var removeSFTPConn = function (path) {
  delete sFTPConn[path];
};

var getFilePath = function (filepath) {
  return filepath;
};

var getPathItem = function(path){
  return require(cfgPath)[path];
};

var getFileCfgs = function () {
  return require(cfgPath);
 };

fs.watch(cfgPath, function(event, filename) {
  if(event=='change'){
    delete require.cache[cfgPath];
  }
});


function ReadStream() {
  this.data = false;
  this.needData = false;
  stream.Readable.call(this);
}
util.inherits(ReadStream, stream.Readable);
ReadStream.prototype._read = function(size) {
  this.needData = true;
  if(this.data){
    if(!this.push(this.data)){
      this.needData = false;
    }
    this.data = false;
  }
};

ReadStream.prototype.stop = function(){
  this.needData = false;
};

ReadStream.prototype.write = function(chunk) {
  if(this.needData){
    if(!this.push(chunk)){
      this.needData = false;
    }
  }else{
    try{
      if(this.data){
    	if(this.data.length>MAX_FILE_SIZE) return;
        this.data = Buffer.concat([this.data,chunk]);
      }else{
        this.data = chunk;
      }
    }catch (err){
      this.data = false;

    }
  }
};

ReadStream.prototype.end = function() {
  this.push(null);
};



module.exports = router;
