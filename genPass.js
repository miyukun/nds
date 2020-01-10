var md5 = require('md5');

//console.log(process.argv);

if(process.argv.length>2 && process.argv[2].length>=6){
	console.log(md5('node-'+process.argv[2]+'-nds').toUpperCase());
}else{
	console.log('参数是一个至少6位的密码');
}
