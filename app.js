
// This is a microservice to build and post install base insights for delivery via Alexa apps

var AWS = require( "aws-sdk" ),
	ECS = require( "aws-sdk" ),
	async = require( "async" ),
	insight,
	gdunFromList,
	GDUNS = []; 

var ECSconfig = {
  s3ForcePathStyle: true,
  endpoint: new AWS.Endpoint('http://10.4.44.125:9020')
};

// launch the process
cycleThru();

function cycleThru() {

	async.series([
	
		// Load list of GDUNs from ECS object
		function(callback) { // callback <<A>>
			console.log('getting list of GDUNS from ECS')
			// setup ECS config to point to Bellevue lab 
			ECS.config.loadFromPath(__dirname + '/ECSconfig.json'); // load ECS credentials
			var ecs = new ECS.S3(ECSconfig);
			var key = 'PNWandNCAcustomers.json';

			// get json data object from ECS bucket
			var params = {
					Bucket: 'pacnwinstalls',
					Key: key
			};	  
			  
			ecs.getObject(params, function(err, data) {
				if (err) {
					callback(err); 
				} else { // success					
					//console.log(data.Body.toString()); // note: Body is outputted as type buffer which is an array of bytes of the body 
					var dataPayload = JSON.parse(data.Body);
					console.log('length = ' + dataPayload.length);
					
					for (var i = 0; i < dataPayload.length; i++) {
						GDUNS.push(dataPayload[i].gduns);
						//console.log('GDUNS[' + i + '] = ' + GDUNS[i]);
					}
					callback() // callback <<A>>
				}
			});	
				
		},
		// then cycle through each GDUN, load the install base data from ECS, extract the insight, and save it out to s3
		function(callback) { // callback <<B>>		
			
			async.forEach(GDUNS, function(gdun, callback) { //The second argument, callback <<B1>>, is the "task callback" for a specific gdun
				//the "task callback" will be called below after each customer/gdun is complete
				//This way async knows which items in the collection have finished	
					
				async.series([
				
					// Pull install base data from ECS 
					function(callback) { // callback <<B1.1>>
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
							} else { // install base data was successfully loaded, so now get insight from data					
								//console.log(data.Body.toString()); // note: Body is outputted as type buffer which is an array of bytes of the body 
								var dataPayload = JSON.parse(data.Body);
								//console.log('installBaseData.rows.length = ' + dataPayload.rows.length);
								var productFamily = 'Symmetrix';
								insight = getCount(productFamily, dataPayload); 
								callback(); // callback <<B1.1>>
							}
						});
							
					},
					// Post to s3 (won't be called before task 1's "task callback" has been called)
					function(callback) { // callback <<B1.2>>
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
								callback(); // callback <<B1.2>> 
							}						
						});
					},
					// wait now before executing the next gdun 
					function(callback) { // callback <<B1.3>>
						console.log('starting prescribed wait period...')
						setTimeout(function() {
							console.log('wait period completed')
							callback(); // callback <<B1.3>>
						}, 654545); // 86400000 = loop through 1 every 24 hours, so for 132, wait 11 min between each to get all done in 24 hrs
					}
				], function(err) { //This function gets called after the three tasks have called their "task callbacks"
					if (err) console.log('Error processing GDUN=' + gdun + ': ' + err);
					gdunFromList = gdun;
					callback(); //callback <<B1>>
				});
				
			}, function(err) {
				if (err) console.log('see error: ' + err);	
				callback(); //callback <<B>>
			});					
			
		}
	], function(err) { // This function gets called after the three tasks have called their "task callbacks" 
		if (err) console.log('Error processing GDUN=' + gdun + ': ' + err);
		
		if ( gdunFromList == GDUNS[GDUNS.length - 1] ) {
			console.log('starting cycle again ***********************************************************************');
			// restart the whole cycle again from the top
			cycleThru();
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













