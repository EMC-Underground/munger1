
// This is a microservice to build and post install base insights for delivery via Alexa apps

var AWS = require( "aws-sdk" ),
	ECS = require( "aws-sdk" ),
	async = require( "async" ),
	insight,
	
// customer gdun sample. Needs to be an ECS object containing all GDUNS that we pull in.
	GDUNS = [
		'081466849',
		'103391843',
		'831703157', 
		'831703157',
		'009483355',
		'783824670',
		'155366107',
		'047897855',
		'932660376',
		'177667227',
		'057156663',	
		'238980408',
		'884727413',
		'092180517',
		'327376653' 
	];


// setup ECS config to point to Bellevue lab 
var ECSconfig = {
  s3ForcePathStyle: true,
  endpoint: new AWS.Endpoint('http://10.4.44.125:9020')
};
 
// kick off the cycle
cycleThru();

function cycleThru() {
	async.forEach(GDUNS, function(gdun, callback) { //The second argument, `callback`, is the "task callback" for a specific gdun
		//the "task callback" will be called below after each customer/gdun is complete
		//This way async knows which items in the collection have finished	
		mungeIt(gdun);	
		callback();
	}, function(err) {
		if (err) console.log('see error: ' + err);
	});
}

function mungeIt(gdun) {
	async.series([
		// Pull install base data from ECS 
		function(callback) {
			console.log('getting data from ECS with GDUN: ' + gdun)
			ECS.config.loadFromPath(__dirname + '/ECSconfig.json');
			var ecs = new ECS.S3(ECSconfig);
			var key = gdun + '.json';
			console.log('key = ' + key)
		
			// get json data object from ECS bucket
			var params = {
					Bucket: 'pacnwinstalls',
					Key: key
			};	  
			  
			ecs.getObject(params, function(err, data) {
				if (err) {
					callback(err); 
				} else { // get insight from data					
					//console.log(data.Body.toString()); // note: Body is outputted as type buffer which is an array of bytes of the body 
					var dataPayload = JSON.parse(data.Body);
					console.log('installBaseData.rows.length = ' + dataPayload.rows.length);
					var productFamily = 'Symmetrix';
					insight = getCount(productFamily, dataPayload); 
					callback();
				}
			});
				
		},
		// Post to s3 (won't be called before task 1's "task callback" has been called)
		function(callback) {
			console.log('posting to s3 as: ' + gdun);
			// create JSON formatted object body to store
			var insightBody = {
			  "key1": insight.toString()
			}			
			console.log('insightBody = ' + JSON.stringify(insightBody));

			AWS.config.loadFromPath(__dirname + '/AWSconfig.json');
			var s3 = new AWS.S3();
			
			// put the data in the s3 bucket
			var s3params = {
					Bucket: 'emcalexa',
					Key: gdun + '.insight1',
					Body: JSON.stringify(insightBody),
					ContentType: 'json'
				};	

			s3.putObject(s3params, function(err, data) {
				if (err) { 
					callback(err); 
				} else { 
					// successful response				
					var eTag = JSON.parse(data.ETag);
					console.log('data.ETag = ' + JSON.parse(data.ETag));
					callback(); 
				}						
			});
		},
		// wait now before executing the next gdun 
		function(callback) {
			setTimeout(function() {
				console.log('delay completed')
				callback();
			}, 8640000); // 86400000 = loop through once every 24 hours, so this is about 2.5 hrs per gdun processed.
		}
	], function(err) { //This function gets called after the two tasks have called their "task callbacks"
		if (err) console.log('Error processing GDUN=' + gdun + ': ' + err);
		if ( gdun == GDUNS[GDUNS.length - 1] ) {
			console.log('starting cycle again ***********************************************************************');
			cycleThru(); // kick the cycle off again
		}
	});
}

function getCount(productFamily, installBaseData) {
	var count = 0;
	for (var i = 0; i < installBaseData.rows.length; i++) {
		if (installBaseData.rows[i].INSTANCE_PRODUCT_FAMILY == productFamily) {
			count++;
		}
	}
	console.log('system count = ' + count);
	return count;
}













