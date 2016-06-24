
// This is a microservice to build and post install base insights for delivery via Alexa apps

var AWS = require( "aws-sdk" ),
	ECS = require( "aws-sdk" ),
	async = require( "async" ),
	insight,
	gdunFromList,
	productFromList,
	productCounter = 0,
	GDUNS = [],
	productFamily = [ // this is the full list available from within Ops Console
		// 'AVALON'
		// 'ApplicationXtender Products'
		// 'Atmos'
		// 'Avamar'
		   'CLARiiON',
		// 'Captiva Products'
		   'Celerra',
		   'Centera',
		   'CloudArray',
		// 'Connectrix'
		// 'DSSD'
		   'Data Domain',
		// 'Data Protection Advisor Family'
		// 'Disk Library'
		// 'DiskXtender'
		// 'Document Sciences'
		// 'Documentum'
		// 'EMC Secure Remote Services'
		// 'Elastic Cloud Storage'
		// 'Greenplum'
		// 'Isilon'
		// 'Kazeon'
		// 'LEAP'
		// 'Mainframe Data Library'
		// 'MirrorView'
		// 'NA'
		// 'Navisphere'
		// 'NetWin'
		// 'NetWorker Family'
		// 'Pivotal'
		// 'PowerPath'
		// 'RSA'
		// 'Rainfinity'
		   'RecoverPoint',
		// 'Retrospect'
		   'ScaleIO Family',
		// 'Smarts'
		// 'SourceOne'
		   'Symmetrix',
		// 'Symmetrix Enginuity'
		// 'UN'
		   'Unity Family',
		   'VMAX Family',
		// 'VMware'
		   'VNX/VNXe Family',
		   'VPLEX Series',
		// 'VSI Plugin Series for VMware vCenter'
		// 'VSPEX BLUE Appliance'
		// 'ViPR Family'
		// 'Watch4Net Family'
		// 'WysDM'
		   'Xtrem'
	];
		

var ECSconfig = {
  s3ForcePathStyle: true,
  endpoint: new AWS.Endpoint('http://10.4.44.125:9020')
};


// launch the process
cycleThru();


function cycleThru() {	

	async.forEach(productFamily, function(product, callback) { //The second argument, callback << OUTER >>, is the "task callback" for a specific productFamily
		//the "task callback" will be called below after each productFamily is complete
		//This way async knows which items in the collection have finished	
			
		async.series([
		
			// Load list of GDUNs from ECS object
			function(callback) { // callback <<A>>
				console.log('<<<<<<<<<<<<<<<<<<<<<  A  >>>>>>>>>>>>>>>>>>>>>>>>>>>>');
				console.log('getting list of GDUNS from ECS')
				// setup ECS config to point to Bellevue lab 
				ECS.config.loadFromPath(__dirname + '/ECSconfig.json'); // load ECS credentials
				var ecs = new ECS.S3(ECSconfig);
				//var key = 'PNWandNCAcustomers.json';
				var key = 'PNWandNCAcustomers-single.json';

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
							console.log('GDUNS[' + i + '] = ' + GDUNS[i]);
						}
						callback() // callback <<A>>
					}
				});	
					
			},
			// then cycle through each GDUN, load the install base data from ECS, extract the insight, and save it out to s3
			function(callback) { // callback <<B>>		
				console.log('<<<<<<<<<<<<<<<<<<<<<  B  >>>>>>>>>>>>>>>>>>>>>>>>>>>>');
				async.forEach(GDUNS, function(gdun, callback) { //The second argument, callback <<B1>>, is the "task callback" for a specific gdun
					//the "task callback" will be called below after each customer/gdun is complete
					//This way async knows which items in the collection have finished	
						
					async.series([
					
						// Pull install base data from ECS 
						function(callback) { // callback <<B1.1>>
							console.log('<<<<<<<<<<<<<<<<<<<<<  B1.1  >>>>>>>>>>>>>>>>>>>>>>>>>>>>');
							console.log('getting data from ECS with GDUN: ' + gdun)
							ECS.config.loadFromPath(__dirname + '/ECSconfig.json');
							var ecs = new ECS.S3(ECSconfig);
							var key = gdun + '.json';
							console.log('ECS key being used to retrieve object = ' + key)
						
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
									console.log('dataPayload.rows.length = ' + dataPayload.rows.length);
									insight = getCount(product, dataPayload); 
									callback(); // callback <<B1.1>>
								}
							});
								
						},
						// Post to s3 (won't be called before task 1's "task callback" has been called)
						function(callback) { // callback <<B1.2>>
							console.log('<<<<<<<<<<<<<<<<<<<<<  B1.2  >>>>>>>>>>>>>>>>>>>>>>>>>>>>');
							// create JSON formatted object body to store
							var insightBody = {
							  "key1": insight.toString()
							}			
							console.log('insightBody = ' + JSON.stringify(insightBody));

							AWS.config.loadFromPath(__dirname + '/AWSconfig.json');
							var s3 = new AWS.S3();
							
							var productKey = product;
							
							if (productKey == 'VNX/VNXe Family') {
								productKey = 'VNX';
							}
							
							// put the data in the s3 bucket
							var s3params = {
									Bucket: 'emcalexa',
									Key: gdun + '.' + productKey,
									Body: JSON.stringify(insightBody),
									ContentType: 'json'
								};	

							s3.putObject(s3params, function(err, data) {
								if (err) { 
									callback(err); 
								} else { 
									// successful response	
									console.log('posted to s3 as: ' + gdun + '.' + productKey);								
									var eTag = JSON.parse(data.ETag);
									console.log('data.ETag = ' + JSON.parse(data.ETag));
									callback(); // callback <<B1.2>> 
								}						
							});
						}
						
					], function(err) {  //This function gets called after the two tasks ( 1) load object, 2) munge and save to s3 ) 
										//have called their "task callbacks"
						console.log('<<<<<<<<<<<<<<<<<<<<<  B SERIES COMPLETE  >>>>>>>>>>>>>>>>>>>>>>>>>>>>');
						if (err) console.log('Error processing GDUN=' + gdun + ': ' + err);
						gdunFromList = gdun;
						productFromList = product;
						console.log('successfully processed GDUN ' + gdun + ' for product = ' + product);
						callback(); //callback <<B1>>
					});
					
				}, function(err) {
					console.log('<<<<<<<<<<<<<<<<<<<<<  FULL B COMPLETE  >>>>>>>>>>>>>>>>>>>>>>>>>>>>');
					if (err) console.log('see error: ' + err);	
					callback(); //callback <<B>>
				});					
				
			}
		], function(err) {  // This function is called after the two tasks ( 1) load list, 2) perform series of: load object->munge->post to s3 ) 
							// have called their "task callbacks" 
			console.log('<<<<<<<<<<<<<<<<<<<<<  FULL A & B COMPLETE FOR GDUN ' + gdunFromList + '  >>>>>>>>>>>>>>>>>>>>>>>>>>>>');
			productCounter++ // increment to recognize completion of all GDUNS for a given product family
			if (err) {
				console.log('Error processing GDUN=' + gdunFromList + ': ' + err);
				callback(err);
			} else {
				callback() // //callback << OUTER >>
			}
			
		});
													
	}, function(err) {
		console.log('<<<<<<<<<<<<<<<<<<<<<  OUTER PRODUCT FAMILY COMPLETE  >>>>>>>>>>>>>>>>>>>>>>>>>>>>');
		if (err) {
			console.log('see error: ' + err);	
		} else {
	
			console.log('productCounter = ' + productCounter)
			console.log('productFamily.length = ' + productFamily.length)
						
			if ( productCounter == productFamily.length ) {
				// give all the tasks time to complete before the app naturally ends and PCF sees it as 'crashed' and restarts it 
				console.log('WAITING 24 HRS now and then starting cycle again ******************************************************************');
				//restart the whole cycle again from the top after wait time
				setTimeout(function() {
					console.log('wait period completed: RESTARTING PROCESS ***********************************************')
					// now the app actually finishes, and PCF will restart it
				}, 86400000); // 86400000 = loop through 1 every 24 hours	
			}				
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













