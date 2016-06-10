var AWS = require( "aws-sdk" ),
	chalk = require( "chalk" ),
	Q = require( "q" ),
	config = require( "./config.json" ),
	numWaits;

AWS.config.loadFromPath(__dirname + '/config.json');

// setup ECS config to point to Bellevue lab 
var ECSconfig = {
  s3ForcePathStyle: true,
  accessKeyId: 'ops-bot',
  secretAccessKey: 'pvBNp1DbR4prHf6gW8IhtSLYcrGjZC2Q9LT2Z+TC',
  endpoint: new AWS.Endpoint('http://10.4.44.125:9020')
}
var ecs = new AWS.S3(ECSconfig)
var s3 = new AWS.S3();


var getInstallBase = function() {
	return new Promise(function(resolve, reject) {	
		
        // get json data object from ECS bucket
        var params = {
				Bucket: 'pacnwinstalls',
				Key: '831703157.json'
        };	  
		  
		ecs.getObject(params, function(err, data) {
			if (err) {
				reject(err); // State will be rejected
			} else {
				resolve(data); // State will be fulfilled	
			}
        });			
				
	});
}

var mungeIt = function(data){
    return new Q.Promise(function(resolve,reject){
		// get insight from data
		//console.log(data.Body.toString()); // note: console.log(JSON.stringify(data)) doesn't properly output data
		var dataPayload = JSON.parse(data.Body);
		//var installBaseData = data.Body
		//console.log(installBaseData);

		console.log('installBaseData.rows.length = ' + dataPayload.rows.length);
				
		var productFamily = 'Symmetrix';
		var insight = getCount(productFamily, dataPayload); 		
		
        if (insight){
            resolve(insight); // State will be fulfilled
        } else {
            reject("error getting insight"); // State will be rejected
        }
    })
}

var postResults = function(insight) {
	return new Promise(function(resolve, reject) {
		console.log('number of Symms = ' + insight);
		// post to s3
		setTimeout(function() {
			
			var insightBody = {
			  "key1": insight.toString()
			}
			
			console.log('insightBody = ' + JSON.stringify(insightBody));
			
			// put the data in the s3 bucket
			var s3params = {
					Bucket: 'emcalexa',
					Key: 'symmCount',
					Body: JSON.stringify(insightBody),
					ContentType: 'json'
				};	

			s3.putObject(s3params, function(err, data) {
				if (err) { 
					reject(err); // State will be rejected
				} else { 
					// successful response
					resolve(data); // State will be fulfilled
					var eTag = JSON.parse(data.ETag);
					console.log('data.ETag = ' + JSON.parse(data.ETag));
				}						
			});										
			console.log('done waiting');
			
		}, 3000);

	});
};

(function extractInsightCycle() {
	getInstallBase().then(mungeIt).then(postResults).then(function(objectID) {
		console.log('object successfully posted, ID: ' + objectID)
		extractInsightCycle();
	}).catch(function(error) {
		console.log('something went wrong', error);
		extractInsightCycle();
	})
} )();

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
